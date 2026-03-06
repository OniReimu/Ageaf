#!/usr/bin/env python3
"""
Metadata Extraction Tool
Extract citation metadata from DOI, PMID, arXiv ID, or URL using various APIs.
Supports preprint-to-published upgrade via multi-source cascade.
"""

import sys
import os
import requests
import argparse
import time
import re
import json
import xml.etree.ElementTree as ET
from typing import Optional, Dict, List, Tuple
from urllib.parse import urlparse


class ExtractionResult:
    """Structured result from metadata extraction with upgrade status."""
    def __init__(self, status, metadata=None, reason='', confidence=None, candidate_doi=None):
        self.status = status        # 'found' | 'upgraded' | 'ambiguous' | 'not_found' | 'error'
        self.metadata = metadata    # dict or None
        self.reason = reason        # human-readable explanation
        self.confidence = confidence  # float for ambiguous matches
        self.candidate_doi = candidate_doi  # DOI candidate for ambiguous


class MetadataExtractor:
    """Extract metadata from various sources and generate BibTeX."""

    def __init__(self, email: Optional[str] = None):
        """
        Initialize extractor.

        Args:
            email: Email for Entrez API (recommended for PubMed)
        """
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'MetadataExtractor/1.0 (Citation Management Tool)'
        })
        self.email = email or os.getenv('NCBI_EMAIL', '')

    def identify_type(self, identifier: str) -> Tuple[str, str]:
        """
        Identify the type of identifier.

        Args:
            identifier: DOI, PMID, arXiv ID, or URL

        Returns:
            Tuple of (type, cleaned_identifier)
        """
        identifier = identifier.strip()

        # Check if URL
        if identifier.startswith('http://') or identifier.startswith('https://'):
            return self._parse_url(identifier)

        # Check for bioRxiv/medRxiv DOI prefix before generic DOI
        # Can't distinguish biorxiv vs medrxiv from DOI alone
        if identifier.startswith('10.1101/'):
            return ('preprint_doi', identifier)

        # Check for DOI
        if identifier.startswith('10.'):
            return ('doi', identifier)

        # Check for arXiv ID
        if re.match(r'^\d{4}\.\d{4,5}(v\d+)?$', identifier):
            return ('arxiv', identifier)
        if identifier.startswith('arXiv:'):
            return ('arxiv', identifier.replace('arXiv:', ''))

        # Check for PMID (8-digit number typically)
        if identifier.isdigit() and len(identifier) >= 7:
            return ('pmid', identifier)

        # Check for PMCID
        if identifier.upper().startswith('PMC') and identifier[3:].isdigit():
            return ('pmcid', identifier.upper())

        return ('unknown', identifier)

    def _parse_url(self, url: str) -> Tuple[str, str]:
        """Parse URL to extract identifier type and value."""
        parsed = urlparse(url)

        # DOI URLs
        if 'doi.org' in parsed.netloc:
            doi = parsed.path.lstrip('/')
            # Can't distinguish biorxiv vs medrxiv from DOI alone
            if doi.startswith('10.1101/'):
                return ('preprint_doi', doi)
            return ('doi', doi)

        # PubMed URLs
        if 'pubmed.ncbi.nlm.nih.gov' in parsed.netloc or 'ncbi.nlm.nih.gov/pubmed' in url:
            pmid = re.search(r'/(\d+)', parsed.path)
            if pmid:
                return ('pmid', pmid.group(1))

        # arXiv URLs
        if 'arxiv.org' in parsed.netloc:
            arxiv_id = re.search(r'/abs/(\d{4}\.\d{4,5})', parsed.path)
            if arxiv_id:
                return ('arxiv', arxiv_id.group(1))

        # bioRxiv URLs
        if 'biorxiv.org' in parsed.netloc:
            doi_match = re.search(r'(10\.1101/[\d.]+)', url)
            if doi_match:
                return ('biorxiv', doi_match.group(1))

        # medRxiv URLs
        if 'medrxiv.org' in parsed.netloc:
            doi_match = re.search(r'(10\.1101/[\d.]+)', url)
            if doi_match:
                return ('medrxiv', doi_match.group(1))

        # Nature, Science, Cell, etc. - try to extract DOI from URL
        doi_match = re.search(r'10\.\d{4,}/[^\s/]+', url)
        if doi_match:
            return ('doi', doi_match.group())

        return ('url', url)

    def extract_from_doi(self, doi: str) -> Optional[Dict]:
        """
        Extract metadata from DOI using CrossRef API.

        Args:
            doi: Digital Object Identifier

        Returns:
            Metadata dictionary or None
        """
        url = f'https://api.crossref.org/works/{doi}'

        try:
            response = self.session.get(url, timeout=15)

            if response.status_code == 200:
                data = response.json()
                message = data.get('message', {})

                entry_type = self._crossref_type_to_bibtex(message.get('type'))
                container_title = message.get('container-title', [''])[0] if message.get('container-title') else ''

                metadata = {
                    'type': 'doi',
                    'entry_type': entry_type,
                    'doi': doi,
                    'title': message.get('title', [''])[0],
                    'authors': self._format_authors_crossref(message.get('author', [])),
                    'year': self._extract_year_crossref(message),
                    'volume': str(message.get('volume', '')) if message.get('volume') else '',
                    'issue': str(message.get('issue', '')) if message.get('issue') else '',
                    'pages': message.get('page', ''),
                    'publisher': message.get('publisher', ''),
                    'url': f'https://doi.org/{doi}'
                }

                # Split container-title into journal vs booktitle based on entry_type
                if entry_type in ('inproceedings', 'incollection'):
                    metadata['booktitle'] = container_title
                    metadata['journal'] = ''
                else:
                    metadata['journal'] = container_title
                    metadata['booktitle'] = ''

                return metadata
            else:
                print(f'Error: CrossRef API returned status {response.status_code} for DOI: {doi}', file=sys.stderr)
                return None

        except Exception as e:
            print(f'Error extracting metadata from DOI {doi}: {e}', file=sys.stderr)
            return None

    def extract_from_pmid(self, pmid: str) -> Optional[Dict]:
        """
        Extract metadata from PMID using PubMed E-utilities.

        Args:
            pmid: PubMed ID

        Returns:
            Metadata dictionary or None
        """
        url = f'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'
        params = {
            'db': 'pubmed',
            'id': pmid,
            'retmode': 'xml',
            'rettype': 'abstract'
        }

        if self.email:
            params['email'] = self.email

        api_key = os.getenv('NCBI_API_KEY')
        if api_key:
            params['api_key'] = api_key

        try:
            response = self.session.get(url, params=params, timeout=15)

            if response.status_code == 200:
                root = ET.fromstring(response.content)
                article = root.find('.//PubmedArticle')

                if article is None:
                    print(f'Error: No article found for PMID: {pmid}', file=sys.stderr)
                    return None

                # Extract metadata from XML
                medline_citation = article.find('.//MedlineCitation')
                article_elem = medline_citation.find('.//Article')
                journal = article_elem.find('.//Journal')

                # Get DOI if available
                doi = None
                article_ids = article.findall('.//ArticleId')
                for article_id in article_ids:
                    if article_id.get('IdType') == 'doi':
                        doi = article_id.text
                        break

                metadata = {
                    'type': 'pmid',
                    'entry_type': 'article',
                    'pmid': pmid,
                    'title': article_elem.findtext('.//ArticleTitle', ''),
                    'authors': self._format_authors_pubmed(article_elem.findall('.//Author')),
                    'year': self._extract_year_pubmed(article_elem),
                    'journal': journal.findtext('.//Title', ''),
                    'volume': journal.findtext('.//JournalIssue/Volume', ''),
                    'issue': journal.findtext('.//JournalIssue/Issue', ''),
                    'pages': article_elem.findtext('.//Pagination/MedlinePgn', ''),
                    'doi': doi
                }

                return metadata
            else:
                print(f'Error: PubMed API returned status {response.status_code} for PMID: {pmid}', file=sys.stderr)
                return None

        except Exception as e:
            print(f'Error extracting metadata from PMID {pmid}: {e}', file=sys.stderr)
            return None

    def extract_from_arxiv(self, arxiv_id: str) -> Optional[Dict]:
        """
        Extract metadata from arXiv ID using arXiv API.
        Backward-compatible wrapper around extract_from_arxiv_structured().

        Args:
            arxiv_id: arXiv identifier

        Returns:
            Metadata dictionary or None
        """
        result = self.extract_from_arxiv_structured(arxiv_id)
        return result.metadata

    def extract_from_arxiv_structured(self, arxiv_id: str) -> ExtractionResult:
        """
        Extract metadata from arXiv ID with multi-source cascade for published version.

        Cascade:
        1. arXiv API (check arxiv:doi field)
        2. Semantic Scholar (paper/arXiv:{id})
        3. CrossRef title search (with confidence scoring)

        Args:
            arxiv_id: arXiv identifier

        Returns:
            ExtractionResult with status and metadata
        """
        # Step 1: Query arXiv API
        url = 'http://export.arxiv.org/api/query'
        params = {
            'id_list': arxiv_id,
            'max_results': 1
        }

        try:
            response = self.session.get(url, params=params, timeout=15)
        except Exception as e:
            return ExtractionResult(
                status='error',
                reason=f'arXiv API request failed: {e}'
            )

        if response.status_code != 200:
            return ExtractionResult(
                status='error',
                reason=f'arXiv API returned status {response.status_code}'
            )

        # Parse Atom XML
        try:
            root = ET.fromstring(response.content)
        except ET.ParseError as e:
            return ExtractionResult(
                status='error',
                reason=f'arXiv API returned invalid XML: {e}'
            )

        ns = {'atom': 'http://www.w3.org/2005/Atom', 'arxiv': 'http://arxiv.org/schemas/atom'}

        entry = root.find('atom:entry', ns)
        if entry is None:
            return ExtractionResult(
                status='not_found',
                reason=f'No entry found for arXiv ID: {arxiv_id}'
            )

        # Extract basic arXiv metadata
        doi_elem = entry.find('arxiv:doi', ns)
        arxiv_doi = doi_elem.text if doi_elem is not None else None

        journal_ref_elem = entry.find('arxiv:journal_ref', ns)
        journal_ref = journal_ref_elem.text if journal_ref_elem is not None else None

        published = entry.findtext('atom:published', '', ns)
        year = published[:4] if published else ''

        authors = []
        for author in entry.findall('atom:author', ns):
            name = author.findtext('atom:name', '', ns)
            if name:
                authors.append(name)

        title = entry.findtext('atom:title', '', ns).strip().replace('\n', ' ')
        authors_str = ' and '.join(authors)

        preprint_metadata = {
            'type': 'arxiv',
            'entry_type': 'misc',
            'arxiv_id': arxiv_id,
            'title': title,
            'authors': authors_str,
            'year': year,
            'doi': arxiv_doi,
            'journal_ref': journal_ref,
            'abstract': entry.findtext('atom:summary', '', ns).strip().replace('\n', ' '),
            'url': f'https://arxiv.org/abs/{arxiv_id}',
            'preprint_source': 'arxiv',
            'preprint_id': arxiv_id
        }

        # Cascade Step 1: arXiv's own DOI field
        if arxiv_doi:
            canonical = self.extract_from_doi(arxiv_doi)
            if canonical:
                canonical['preprint_source'] = 'arxiv'
                canonical['preprint_id'] = arxiv_id
                return ExtractionResult(
                    status='upgraded',
                    metadata=canonical,
                    reason=f'Published DOI {arxiv_doi} found via arXiv API'
                )

        # Cascade Step 2: Semantic Scholar
        s2_result = self._query_semantic_scholar(arxiv_id)
        if s2_result and s2_result.get('doi'):
            canonical = self.extract_from_doi(s2_result['doi'])
            if canonical:
                canonical['preprint_source'] = 'arxiv'
                canonical['preprint_id'] = arxiv_id
                return ExtractionResult(
                    status='upgraded',
                    metadata=canonical,
                    reason=f'Published DOI {s2_result["doi"]} found via Semantic Scholar'
                )

        # Cascade Step 3: CrossRef title search
        first_author = self._extract_first_author_family(authors_str)
        search_result = self._crossref_title_search(title, first_author, year)

        if search_result:
            confidence = search_result['confidence']
            if confidence >= 0.85:
                canonical = self.extract_from_doi(search_result['doi'])
                if canonical:
                    canonical['preprint_source'] = 'arxiv'
                    canonical['preprint_id'] = arxiv_id
                    return ExtractionResult(
                        status='upgraded',
                        metadata=canonical,
                        confidence=confidence,
                        reason=f'Published DOI {search_result["doi"]} found via CrossRef title search (confidence={confidence:.2f})'
                    )
            elif confidence >= 0.70:
                return ExtractionResult(
                    status='ambiguous',
                    metadata=preprint_metadata,
                    confidence=confidence,
                    candidate_doi=search_result['doi'],
                    reason=f'Possible match DOI {search_result["doi"]} (confidence={confidence:.2f})'
                )

        # No published version found — return preprint
        return ExtractionResult(
            status='found',
            metadata=preprint_metadata,
            reason='No published version found'
        )

    def _query_semantic_scholar(self, arxiv_id: str) -> Optional[Dict]:
        """
        Query Semantic Scholar for a paper's external IDs.

        Args:
            arxiv_id: arXiv identifier

        Returns:
            Dict with doi, venue, year, title or None
        """
        url = f'https://api.semanticscholar.org/graph/v1/paper/arXiv:{arxiv_id}'
        params = {'fields': 'externalIds,venue,year,title'}

        headers = {}
        api_key = os.getenv('S2_API_KEY')
        if api_key:
            headers['x-api-key'] = api_key

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self.session.get(url, params=params, headers=headers, timeout=15)

                if response.status_code == 200:
                    data = response.json()
                    external_ids = data.get('externalIds', {})
                    return {
                        'doi': external_ids.get('DOI'),
                        'venue': data.get('venue', ''),
                        'year': data.get('year'),
                        'title': data.get('title', '')
                    }
                elif response.status_code == 404:
                    return None
                elif response.status_code == 429:
                    wait = 2 ** attempt
                    print(f'Semantic Scholar rate limited, retrying in {wait}s...', file=sys.stderr)
                    time.sleep(wait)
                    continue
                else:
                    print(f'Semantic Scholar returned status {response.status_code}', file=sys.stderr)
                    return None

            except Exception as e:
                print(f'Semantic Scholar request failed: {e}', file=sys.stderr)
                return None

        return None

    def _crossref_title_search(self, title: str, first_author_family: str, year: str) -> Optional[Dict]:
        """
        Search CrossRef by title with confidence scoring.

        Args:
            title: Paper title
            first_author_family: First author's family name
            year: Publication year

        Returns:
            Dict with doi, confidence, title or None
        """
        url = 'https://api.crossref.org/works'
        params = {
            'query.title': title,
            'rows': 5,
            'select': 'DOI,title,author,container-title,published-print,published-online,type'
        }

        try:
            response = self.session.get(url, params=params, timeout=15)
            if response.status_code != 200:
                return None

            data = response.json()
            items = data.get('message', {}).get('items', [])

            # Type whitelist — filter out preprints
            allowed_types = {'journal-article', 'proceedings-article', 'book-chapter', 'book'}

            best_match = None
            best_confidence = 0.0

            for item in items:
                if item.get('type') not in allowed_types:
                    continue

                candidate_title = item.get('title', [''])[0] if item.get('title') else ''

                # Confidence scoring
                confidence = self._compute_title_confidence(
                    title, candidate_title, first_author_family,
                    item.get('author', []), year, item
                )

                if confidence > best_confidence:
                    best_confidence = confidence
                    best_match = {
                        'doi': item.get('DOI'),
                        'title': candidate_title,
                        'confidence': confidence
                    }

            if best_match and best_confidence >= 0.70:
                return best_match

            return None

        except Exception as e:
            print(f'CrossRef title search failed: {e}', file=sys.stderr)
            return None

    def _compute_title_confidence(self, query_title: str, candidate_title: str,
                                   first_author_family: str, candidate_authors: List[Dict],
                                   year: str, item: Dict) -> float:
        """Compute confidence score for a CrossRef title match."""
        # Base: Jaccard similarity on normalized title words
        query_words = set(self._normalize_title(query_title).split())
        candidate_words = set(self._normalize_title(candidate_title).split())

        if not query_words or not candidate_words:
            return 0.0

        intersection = query_words & candidate_words
        union = query_words | candidate_words
        confidence = len(intersection) / len(union) if union else 0.0

        # +0.15 for first author family name match
        if first_author_family and candidate_authors:
            candidate_first_family = candidate_authors[0].get('family', '')
            if candidate_first_family and first_author_family.lower() == candidate_first_family.lower():
                confidence += 0.15

        # -0.20 for year difference > 2
        if year:
            candidate_year = self._extract_year_crossref(item)
            if candidate_year:
                try:
                    if abs(int(year) - int(candidate_year)) > 2:
                        confidence -= 0.20
                except ValueError:
                    pass

        return confidence

    @staticmethod
    def _normalize_title(title: str) -> str:
        """Normalize title for comparison: lowercase, strip punctuation, collapse whitespace."""
        title = title.lower()
        title = re.sub(r'[^\w\s]', ' ', title)
        title = re.sub(r'\s+', ' ', title).strip()
        return title

    @staticmethod
    def _extract_first_author_family(authors_str: str) -> str:
        """Extract first author's family name from BibTeX author string."""
        if not authors_str:
            return ''
        first_author = authors_str.split(' and ')[0].strip()
        if ',' in first_author:
            return first_author.split(',')[0].strip()
        parts = first_author.split()
        return parts[-1] if parts else ''

    def resolve_preprint_doi(self, preprint_doi: str) -> ExtractionResult:
        """
        Resolve a 10.1101/ DOI by trying both bioRxiv and medRxiv servers.

        Used when the source server is unknown (bare DOI or doi.org URL).

        Args:
            preprint_doi: DOI starting with 10.1101/

        Returns:
            ExtractionResult with status and metadata
        """
        best_found = None
        for server in ('biorxiv', 'medrxiv'):
            result = self.extract_from_biorxiv(preprint_doi, server=server)
            if result.status == 'upgraded':
                return result
            if result.status == 'found':
                # Prefer native details API results over CrossRef fallbacks
                is_native = getattr(result, '_native', False)
                best_is_native = getattr(best_found, '_native', False) if best_found else False
                if best_found is None or (is_native and not best_is_native):
                    best_found = result
        if best_found is not None:
            return best_found
        return ExtractionResult(
            status='error',
            reason=f'Failed to resolve preprint DOI {preprint_doi} via bioRxiv or medRxiv'
        )

    def extract_from_biorxiv(self, preprint_doi: str, server: str = 'biorxiv') -> ExtractionResult:
        """
        Extract metadata from bioRxiv/medRxiv with upgrade to published version.

        Uses the pubs API to find published DOI, then CrossRef for canonical metadata.

        Args:
            preprint_doi: bioRxiv/medRxiv DOI (10.1101/...)
            server: 'biorxiv' or 'medrxiv'

        Returns:
            ExtractionResult with status and metadata
        """
        # Try pubs API for published DOI
        pubs_url = f'https://api.biorxiv.org/pubs/{server}/{preprint_doi}/na/json'

        try:
            response = self.session.get(pubs_url, timeout=15)

            if response.status_code == 200:
                data = response.json()
                collection = data.get('collection', [])

                # Look for published DOI
                for item in collection:
                    published_doi = item.get('published_doi')
                    if published_doi:
                        canonical = self.extract_from_doi(published_doi)
                        if canonical:
                            canonical['preprint_source'] = server
                            canonical['preprint_id'] = preprint_doi
                            return ExtractionResult(
                                status='upgraded',
                                metadata=canonical,
                                reason=f'Published DOI {published_doi} found via {server} pubs API'
                            )
        except Exception as e:
            print(f'{server} pubs API request failed: {e}', file=sys.stderr)

        # Fallback: details API for preprint metadata
        details_url = f'https://api.biorxiv.org/details/{server}/{preprint_doi}/na/json'

        try:
            response = self.session.get(details_url, timeout=15)

            if response.status_code == 200:
                data = response.json()
                collection = data.get('collection', [])

                if collection:
                    item = collection[-1]  # Latest version
                    metadata = {
                        'type': server,
                        'entry_type': 'misc',
                        'doi': preprint_doi,
                        'title': item.get('title', ''),
                        'authors': item.get('authors', ''),
                        'year': item.get('date', '')[:4] if item.get('date') else '',
                        'preprint_source': server,
                        'preprint_id': preprint_doi,
                        'url': f'https://doi.org/{preprint_doi}'
                    }
                    result = ExtractionResult(
                        status='found',
                        metadata=metadata,
                        reason=f'No published version found via {server} pubs API'
                    )
                    result._native = True
                    return result
        except Exception as e:
            print(f'{server} details API request failed: {e}', file=sys.stderr)

        # Last resort: try CrossRef for the preprint DOI itself
        metadata = self.extract_from_doi(preprint_doi)
        if metadata:
            metadata['preprint_source'] = server
            metadata['preprint_id'] = preprint_doi
            result = ExtractionResult(
                status='found',
                metadata=metadata,
                reason=f'Returned preprint metadata from CrossRef'
            )
            result._native = False
            return result

        return ExtractionResult(
            status='error',
            reason=f'Failed to retrieve metadata for {server} DOI {preprint_doi}'
        )

    def metadata_to_bibtex(self, metadata: Dict, citation_key: Optional[str] = None) -> str:
        """
        Convert metadata dictionary to BibTeX format.

        Args:
            metadata: Metadata dictionary
            citation_key: Optional custom citation key

        Returns:
            BibTeX string
        """
        if not citation_key:
            citation_key = self._generate_citation_key(metadata)

        entry_type = metadata.get('entry_type', 'misc')

        # Build BibTeX entry
        lines = [f'@{entry_type}{{{citation_key},']

        # Add fields
        if metadata.get('authors'):
            lines.append(f'  author  = {{{metadata["authors"]}}},')

        if metadata.get('title'):
            # Protect capitalization
            title = self._protect_title(metadata['title'])
            lines.append(f'  title   = {{{title}}},')

        if entry_type == 'article' and metadata.get('journal'):
            lines.append(f'  journal = {{{metadata["journal"]}}},')
        elif entry_type in ('inproceedings', 'incollection') and metadata.get('booktitle'):
            lines.append(f'  booktitle = {{{metadata["booktitle"]}}},')
        elif entry_type == 'misc':
            preprint_source = metadata.get('preprint_source', '')
            if metadata.get('type') == 'arxiv' or preprint_source == 'arxiv':
                lines.append(f'  howpublished = {{arXiv}},')
            elif preprint_source == 'biorxiv' or metadata.get('type') == 'biorxiv':
                lines.append(f'  howpublished = {{bioRxiv}},')
            elif preprint_source == 'medrxiv' or metadata.get('type') == 'medrxiv':
                lines.append(f'  howpublished = {{medRxiv}},')

        if metadata.get('year'):
            lines.append(f'  year    = {{{metadata["year"]}}},')

        if metadata.get('volume'):
            lines.append(f'  volume  = {{{metadata["volume"]}}},')

        if metadata.get('issue'):
            lines.append(f'  number  = {{{metadata["issue"]}}},')

        if metadata.get('pages'):
            pages = metadata['pages'].replace('-', '--')  # En-dash
            lines.append(f'  pages   = {{{pages}}},')

        # Publisher for book, incollection, inproceedings
        if entry_type in ('book', 'incollection', 'inproceedings') and metadata.get('publisher'):
            lines.append(f'  publisher = {{{metadata["publisher"]}}},')

        if metadata.get('doi'):
            lines.append(f'  doi     = {{{metadata["doi"]}}},')
        elif metadata.get('url'):
            lines.append(f'  url     = {{{metadata["url"]}}},')

        if metadata.get('pmid'):
            lines.append(f'  note    = {{PMID: {metadata["pmid"]}}},')

        preprint_source = metadata.get('preprint_source', '')
        if (metadata.get('type') == 'arxiv' or preprint_source == 'arxiv') and not metadata.get('doi'):
            lines.append(f'  note    = {{Preprint}},')

        # Remove trailing comma from last field
        if lines[-1].endswith(','):
            lines[-1] = lines[-1][:-1]

        lines.append('}')

        return '\n'.join(lines)

    def _crossref_type_to_bibtex(self, crossref_type: str) -> str:
        """Map CrossRef type to BibTeX entry type."""
        type_map = {
            'journal-article': 'article',
            'book': 'book',
            'book-chapter': 'incollection',
            'proceedings-article': 'inproceedings',
            'posted-content': 'misc',
            'dataset': 'misc',
            'report': 'techreport'
        }
        return type_map.get(crossref_type, 'misc')

    def _format_authors_crossref(self, authors: List[Dict]) -> str:
        """Format author list from CrossRef data."""
        if not authors:
            return ''

        formatted = []
        for author in authors:
            given = author.get('given', '')
            family = author.get('family', '')
            if family:
                if given:
                    formatted.append(f'{family}, {given}')
                else:
                    formatted.append(family)

        return ' and '.join(formatted)

    def _format_authors_pubmed(self, authors: List) -> str:
        """Format author list from PubMed XML."""
        formatted = []
        for author in authors:
            last_name = author.findtext('.//LastName', '')
            fore_name = author.findtext('.//ForeName', '')
            if last_name:
                if fore_name:
                    formatted.append(f'{last_name}, {fore_name}')
                else:
                    formatted.append(last_name)

        return ' and '.join(formatted)

    def _extract_year_crossref(self, message: Dict) -> str:
        """Extract year from CrossRef message."""
        # Try published-print first, then published-online
        date_parts = message.get('published-print', {}).get('date-parts', [[]])
        if not date_parts or not date_parts[0]:
            date_parts = message.get('published-online', {}).get('date-parts', [[]])

        if date_parts and date_parts[0]:
            return str(date_parts[0][0])
        return ''

    def _extract_year_pubmed(self, article: ET.Element) -> str:
        """Extract year from PubMed XML."""
        year = article.findtext('.//Journal/JournalIssue/PubDate/Year', '')
        if not year:
            medline_date = article.findtext('.//Journal/JournalIssue/PubDate/MedlineDate', '')
            if medline_date:
                year_match = re.search(r'\d{4}', medline_date)
                if year_match:
                    year = year_match.group()
        return year

    def _generate_citation_key(self, metadata: Dict) -> str:
        """Generate a citation key from metadata."""
        # Get first author last name
        authors = metadata.get('authors', '')
        if authors:
            first_author = authors.split(' and ')[0]
            if ',' in first_author:
                last_name = first_author.split(',')[0].strip()
            else:
                last_name = first_author.split()[-1] if first_author else 'Unknown'
        else:
            last_name = 'Unknown'

        # Get year
        year = metadata.get('year', '').strip()
        if not year:
            year = 'XXXX'

        # Clean last name (remove special characters)
        last_name = re.sub(r'[^a-zA-Z]', '', last_name)

        # Get keyword from title
        title = metadata.get('title', '')
        words = re.findall(r'\b[a-zA-Z]{4,}\b', title)
        keyword = words[0].lower() if words else 'paper'

        return f'{last_name}{year}{keyword}'

    def _protect_title(self, title: str) -> str:
        """Protect capitalization in title for BibTeX."""
        # Protect common acronyms and proper nouns
        protected_words = [
            'DNA', 'RNA', 'CRISPR', 'COVID', 'HIV', 'AIDS', 'AlphaFold',
            'Python', 'AI', 'ML', 'GPU', 'CPU', 'USA', 'UK', 'EU'
        ]

        for word in protected_words:
            title = re.sub(rf'\b{word}\b', f'{{{word}}}', title, flags=re.IGNORECASE)

        return title

    def extract(self, identifier: str) -> Optional[str]:
        """
        Extract metadata and return BibTeX.

        Args:
            identifier: DOI, PMID, arXiv ID, or URL

        Returns:
            BibTeX string or None
        """
        id_type, clean_id = self.identify_type(identifier)

        print(f'Identified as {id_type}: {clean_id}', file=sys.stderr)

        metadata = None

        if id_type == 'doi':
            metadata = self.extract_from_doi(clean_id)
        elif id_type == 'pmid':
            metadata = self.extract_from_pmid(clean_id)
        elif id_type == 'arxiv':
            metadata = self.extract_from_arxiv(clean_id)
        elif id_type == 'biorxiv':
            result = self.extract_from_biorxiv(clean_id, server='biorxiv')
            metadata = result.metadata
        elif id_type == 'medrxiv':
            result = self.extract_from_biorxiv(clean_id, server='medrxiv')
            metadata = result.metadata
        elif id_type == 'preprint_doi':
            result = self.resolve_preprint_doi(clean_id)
            metadata = result.metadata
        else:
            print(f'Error: Unknown identifier type: {identifier}', file=sys.stderr)
            return None

        if metadata:
            return self.metadata_to_bibtex(metadata)
        else:
            return None


def main():
    """Command-line interface."""
    parser = argparse.ArgumentParser(
        description='Extract citation metadata from DOI, PMID, arXiv ID, or URL',
        epilog='Example: python extract_metadata.py --doi 10.1038/s41586-021-03819-2'
    )

    parser.add_argument('--doi', help='Digital Object Identifier')
    parser.add_argument('--pmid', help='PubMed ID')
    parser.add_argument('--arxiv', help='arXiv ID')
    parser.add_argument('--url', help='URL to article')
    parser.add_argument('-i', '--input', help='Input file with identifiers (one per line)')
    parser.add_argument('-o', '--output', help='Output file for BibTeX (default: stdout)')
    parser.add_argument('--format', choices=['bibtex', 'json'], default='bibtex', help='Output format')
    parser.add_argument('--email', help='Email for NCBI E-utilities (recommended)')

    args = parser.parse_args()

    # Collect identifiers
    identifiers = []
    if args.doi:
        identifiers.append(args.doi)
    if args.pmid:
        identifiers.append(args.pmid)
    if args.arxiv:
        identifiers.append(args.arxiv)
    if args.url:
        identifiers.append(args.url)

    if args.input:
        try:
            with open(args.input, 'r', encoding='utf-8') as f:
                file_ids = [line.strip() for line in f if line.strip()]
                identifiers.extend(file_ids)
        except Exception as e:
            print(f'Error reading input file: {e}', file=sys.stderr)
            sys.exit(1)

    if not identifiers:
        parser.print_help()
        sys.exit(1)

    # Extract metadata
    extractor = MetadataExtractor(email=args.email)
    bibtex_entries = []

    for i, identifier in enumerate(identifiers):
        print(f'\nProcessing {i+1}/{len(identifiers)}...', file=sys.stderr)
        bibtex = extractor.extract(identifier)
        if bibtex:
            bibtex_entries.append(bibtex)

        # Rate limiting
        if i < len(identifiers) - 1:
            time.sleep(0.5)

    if not bibtex_entries:
        print('Error: No successful extractions', file=sys.stderr)
        sys.exit(1)

    # Format output
    if args.format == 'bibtex':
        output = '\n\n'.join(bibtex_entries) + '\n'
    else:  # json
        output = json.dumps({
            'count': len(bibtex_entries),
            'entries': bibtex_entries
        }, indent=2)

    # Write output
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f'\nSuccessfully wrote {len(bibtex_entries)} entries to {args.output}', file=sys.stderr)
    else:
        print(output)

    print(f'\nExtracted {len(bibtex_entries)}/{len(identifiers)} entries', file=sys.stderr)


if __name__ == '__main__':
    main()
