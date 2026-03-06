#!/usr/bin/env python3
"""
Preprint-to-Published Upgrade Scanner (Report-Only)

Scans a .bib file for preprint entries, queries multiple APIs to find published
versions, and outputs a JSON report with upgrade recommendations.

Does NOT modify the original .bib file.
"""

import sys
import re
import json
import time
import argparse
from typing import List, Dict, Optional, Tuple

from extract_metadata import MetadataExtractor, ExtractionResult


def parse_bib_entries(bib_content: str) -> List[Dict]:
    """
    Parse a .bib file into a list of entry dicts.

    Each entry dict has:
        - key: citation key
        - entry_type: e.g. 'article', 'misc', 'inproceedings'
        - fields: dict of field_name -> field_value (braces stripped)
        - raw: original raw text of the entry

    This is a simple regex-based parser sufficient for preprint detection.
    It does NOT handle all BibTeX edge cases (nested braces in values, etc.).
    """
    entries = []

    # Match @type{key, ... }
    # Use a state machine to handle nested braces
    i = 0
    while i < len(bib_content):
        # Find next @
        at_pos = bib_content.find('@', i)
        if at_pos == -1:
            break

        # Extract entry type
        type_match = re.match(r'@(\w+)\s*\{', bib_content[at_pos:])
        if not type_match:
            i = at_pos + 1
            continue

        entry_type = type_match.group(1).lower()
        brace_start = at_pos + type_match.end() - 1  # Position of opening {

        # Find matching closing brace
        depth = 1
        pos = brace_start + 1
        while pos < len(bib_content) and depth > 0:
            if bib_content[pos] == '{':
                depth += 1
            elif bib_content[pos] == '}':
                depth -= 1
            pos += 1

        if depth != 0:
            i = at_pos + 1
            continue

        raw = bib_content[at_pos:pos]
        body = bib_content[brace_start + 1:pos - 1]

        # Extract citation key (first thing before comma)
        key_match = re.match(r'\s*([^,\s]+)\s*,', body)
        if not key_match:
            i = pos
            continue

        key = key_match.group(1)
        fields_str = body[key_match.end():]

        # Parse fields
        fields = {}
        field_pattern = re.compile(r'\s*(\w+)\s*=\s*')
        fpos = 0
        while fpos < len(fields_str):
            fm = field_pattern.match(fields_str, fpos)
            if not fm:
                fpos += 1
                continue

            field_name = fm.group(1).lower()
            vstart = fm.end()

            # Extract value — handle {braced} or "quoted" or bare
            if vstart < len(fields_str) and fields_str[vstart] == '{':
                # Braced value
                d = 1
                vp = vstart + 1
                while vp < len(fields_str) and d > 0:
                    if fields_str[vp] == '{':
                        d += 1
                    elif fields_str[vp] == '}':
                        d -= 1
                    vp += 1
                value = fields_str[vstart + 1:vp - 1]
                fpos = vp
            elif vstart < len(fields_str) and fields_str[vstart] == '"':
                # Quoted value
                vp = vstart + 1
                while vp < len(fields_str) and fields_str[vp] != '"':
                    vp += 1
                value = fields_str[vstart + 1:vp]
                fpos = vp + 1
            else:
                # Bare value (number or macro)
                vm = re.match(r'\s*([^,}\s]+)', fields_str[vstart:])
                if vm:
                    value = vm.group(1)
                    fpos = vstart + vm.end()
                else:
                    fpos = vstart + 1
                    continue

            fields[field_name] = value.strip()
            # Skip comma
            comma = re.match(r'\s*,?\s*', fields_str[fpos:])
            if comma:
                fpos += comma.end()

        entries.append({
            'key': key,
            'entry_type': entry_type,
            'fields': fields,
            'raw': raw
        })

        i = pos

    return entries


def detect_preprint(entry: Dict) -> Optional[Tuple[str, str]]:
    """
    Detect if a bib entry is a preprint.

    Returns:
        Tuple of (source, identifier) or None.
        source: 'arxiv', 'biorxiv', 'medrxiv'
        identifier: arXiv ID or bioRxiv/medRxiv DOI
    """
    fields = entry.get('fields', {})
    entry_type = entry.get('entry_type', '')

    # Check howpublished
    howpublished = fields.get('howpublished', '').lower()
    if 'arxiv' in howpublished:
        # Try to find arXiv ID from eprint, note, or url
        arxiv_id = _extract_arxiv_id(fields)
        if arxiv_id:
            return ('arxiv', arxiv_id)
    if 'biorxiv' in howpublished:
        doi = fields.get('doi', '')
        if doi:
            return ('biorxiv', doi)
    if 'medrxiv' in howpublished:
        doi = fields.get('doi', '')
        if doi:
            return ('medrxiv', doi)

    # Check note for arXiv ID
    note = fields.get('note', '')
    arxiv_match = re.search(r'arXiv[:\s]*(\d{4}\.\d{4,5})', note, re.IGNORECASE)
    if arxiv_match:
        return ('arxiv', arxiv_match.group(1))

    # Check eprint field
    eprint = fields.get('eprint', '')
    if re.match(r'\d{4}\.\d{4,5}(v\d+)?$', eprint):
        return ('arxiv', re.sub(r'v\d+$', '', eprint))

    # Check URL
    url = fields.get('url', '')
    if 'arxiv.org' in url:
        arxiv_id = re.search(r'(\d{4}\.\d{4,5})', url)
        if arxiv_id:
            return ('arxiv', arxiv_id.group(1))
    if 'biorxiv.org' in url:
        doi_match = re.search(r'(10\.1101/[\d.]+)', url)
        if doi_match:
            return ('biorxiv', doi_match.group(1))
    if 'medrxiv.org' in url:
        doi_match = re.search(r'(10\.1101/[\d.]+)', url)
        if doi_match:
            return ('medrxiv', doi_match.group(1))

    # Check DOI prefix for bioRxiv/medRxiv (10.1101/) with misc entry type
    # Use 'preprint_doi' since we can't distinguish server from DOI alone
    doi = fields.get('doi', '')
    if doi.startswith('10.1101/') and entry_type == 'misc':
        return ('preprint_doi', doi)

    return None


def _extract_arxiv_id(fields: Dict) -> Optional[str]:
    """Extract arXiv ID from various fields."""
    # eprint field
    eprint = fields.get('eprint', '')
    if re.match(r'\d{4}\.\d{4,5}(v\d+)?$', eprint):
        return re.sub(r'v\d+$', '', eprint)

    # note field
    note = fields.get('note', '')
    match = re.search(r'arXiv[:\s]*(\d{4}\.\d{4,5})', note, re.IGNORECASE)
    if match:
        return match.group(1)

    # url field
    url = fields.get('url', '')
    match = re.search(r'arxiv\.org/abs/(\d{4}\.\d{4,5})', url)
    if match:
        return match.group(1)

    # doi field (arxiv DOIs)
    doi = fields.get('doi', '')
    match = re.search(r'10\.48550/arXiv\.(\d{4}\.\d{4,5})', doi)
    if match:
        return match.group(1)

    return None


def upgrade_preprints(bib_path: str, report_path: Optional[str] = None) -> Dict:
    """
    Scan a .bib file for preprints and find published versions.

    Args:
        bib_path: Path to .bib file
        report_path: Optional path for JSON report output

    Returns:
        Report dict with upgraded, ambiguous, skipped lists
    """
    with open(bib_path, 'r', encoding='utf-8') as f:
        content = f.read()

    entries = parse_bib_entries(content)
    extractor = MetadataExtractor()

    report = {
        'source_file': bib_path,
        'total_entries': len(entries),
        'preprints_found': 0,
        'upgraded': [],
        'ambiguous': [],
        'skipped': []
    }

    preprints = []
    for entry in entries:
        detection = detect_preprint(entry)
        if detection:
            preprints.append((entry, detection))

    report['preprints_found'] = len(preprints)
    print(f'Found {len(preprints)} preprint entries in {len(entries)} total', file=sys.stderr)

    for idx, (entry, (source, identifier)) in enumerate(preprints):
        print(f'Processing {idx+1}/{len(preprints)}: {entry["key"]} ({source}:{identifier})', file=sys.stderr)

        try:
            if source == 'arxiv':
                result = extractor.extract_from_arxiv_structured(identifier)
            elif source in ('biorxiv', 'medrxiv'):
                result = extractor.extract_from_biorxiv(identifier, server=source)
            elif source == 'preprint_doi':
                result = extractor.resolve_preprint_doi(identifier)
            else:
                result = ExtractionResult(status='error', reason=f'Unknown source: {source}')

            if result.status == 'upgraded':
                new_bibtex = extractor.metadata_to_bibtex(result.metadata, citation_key=entry['key'])
                report['upgraded'].append({
                    'original_key': entry['key'],
                    'source': source,
                    'identifier': identifier,
                    'new_doi': result.metadata.get('doi', ''),
                    'new_type': result.metadata.get('entry_type', ''),
                    'new_bibtex': new_bibtex,
                    'reason': result.reason
                })
            elif result.status == 'ambiguous':
                report['ambiguous'].append({
                    'original_key': entry['key'],
                    'source': source,
                    'identifier': identifier,
                    'candidate_doi': result.candidate_doi,
                    'confidence': result.confidence,
                    'reason': result.reason
                })
            else:
                report['skipped'].append({
                    'original_key': entry['key'],
                    'source': source,
                    'identifier': identifier,
                    'reason': result.reason
                })

        except Exception as e:
            report['skipped'].append({
                'original_key': entry['key'],
                'source': source,
                'identifier': identifier,
                'reason': f'Error: {e}'
            })

        # Rate limiting between entries
        if idx < len(preprints) - 1:
            time.sleep(1)

    # Summary
    print(f'\nResults: {len(report["upgraded"])} upgraded, '
          f'{len(report["ambiguous"])} ambiguous, '
          f'{len(report["skipped"])} skipped', file=sys.stderr)

    # Write report
    if report_path:
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f'Report written to {report_path}', file=sys.stderr)

    return report


def main():
    parser = argparse.ArgumentParser(
        description='Scan .bib file for preprints and find published versions (report-only)',
        epilog='Example: python upgrade_preprints.py references.bib --report report.json'
    )

    parser.add_argument('bib_file', help='Path to .bib file')
    parser.add_argument('--report', help='Output path for JSON report (default: stdout)')

    args = parser.parse_args()

    report = upgrade_preprints(args.bib_file, args.report)

    if not args.report:
        print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
