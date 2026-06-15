#!/usr/bin/env python3
"""
Mocked unit tests for preprint-to-published upgrade functionality.

All HTTP calls are mocked — no network access required.
Run: python -m pytest test_preprint_upgrade.py -v
"""

import unittest
from unittest.mock import patch, MagicMock
import json

from extract_metadata import MetadataExtractor, ExtractionResult
from upgrade_preprints import detect_preprint, parse_bib_entries


# ---------------------------------------------------------------------------
# ExtractionResult tests
# ---------------------------------------------------------------------------

class TestExtractionResult(unittest.TestCase):

    def test_upgraded_has_metadata(self):
        result = ExtractionResult(
            status='upgraded',
            metadata={'doi': '10.1038/s41586-021-03819-2', 'title': 'Test'},
            reason='Found via arXiv API'
        )
        self.assertEqual(result.status, 'upgraded')
        self.assertIsNotNone(result.metadata)
        self.assertIn('doi', result.metadata)

    def test_ambiguous_has_candidate(self):
        result = ExtractionResult(
            status='ambiguous',
            metadata={'title': 'Test'},
            confidence=0.78,
            candidate_doi='10.1234/test',
            reason='Low confidence match'
        )
        self.assertEqual(result.status, 'ambiguous')
        self.assertIsNotNone(result.candidate_doi)
        self.assertIsNotNone(result.confidence)
        self.assertGreater(result.confidence, 0.0)

    def test_not_found_no_metadata(self):
        result = ExtractionResult(status='not_found', reason='No entry')
        self.assertEqual(result.status, 'not_found')
        self.assertIsNone(result.metadata)

    def test_error_status(self):
        result = ExtractionResult(status='error', reason='API failed')
        self.assertEqual(result.status, 'error')


# ---------------------------------------------------------------------------
# BibTeX renderer tests
# ---------------------------------------------------------------------------

class TestBibTeXRenderer(unittest.TestCase):

    def setUp(self):
        self.extractor = MetadataExtractor()

    def test_inproceedings_has_booktitle(self):
        metadata = {
            'entry_type': 'inproceedings',
            'title': 'Deep Residual Learning',
            'authors': 'He, Kaiming and Zhang, Xiangyu',
            'year': '2016',
            'booktitle': 'IEEE Conference on Computer Vision and Pattern Recognition',
            'doi': '10.1109/CVPR.2016.90',
            'publisher': 'IEEE'
        }
        bibtex = self.extractor.metadata_to_bibtex(metadata, citation_key='he2016deep')
        self.assertIn('booktitle', bibtex)
        self.assertIn('IEEE Conference on Computer Vision', bibtex)
        self.assertNotIn('journal', bibtex)

    def test_article_has_journal(self):
        metadata = {
            'entry_type': 'article',
            'title': 'Attention Is All You Need',
            'authors': 'Vaswani, Ashish',
            'year': '2017',
            'journal': 'Advances in Neural Information Processing Systems',
            'doi': '10.5555/3295222.3295349'
        }
        bibtex = self.extractor.metadata_to_bibtex(metadata, citation_key='vaswani2017attention')
        self.assertIn('journal', bibtex)
        self.assertNotIn('booktitle', bibtex)

    def test_publisher_rendered_for_book(self):
        metadata = {
            'entry_type': 'book',
            'title': 'Deep Learning',
            'authors': 'Goodfellow, Ian',
            'year': '2016',
            'publisher': 'MIT Press',
            'doi': '10.5555/3086952'
        }
        bibtex = self.extractor.metadata_to_bibtex(metadata, citation_key='goodfellow2016deep')
        self.assertIn('publisher', bibtex)
        self.assertIn('MIT Press', bibtex)

    def test_publisher_rendered_for_inproceedings(self):
        metadata = {
            'entry_type': 'inproceedings',
            'title': 'Test Paper',
            'authors': 'Author, Test',
            'year': '2023',
            'booktitle': 'Test Conference',
            'publisher': 'ACM',
            'doi': '10.1145/test'
        }
        bibtex = self.extractor.metadata_to_bibtex(metadata, citation_key='author2023test')
        self.assertIn('publisher = {ACM}', bibtex)

    def test_publisher_not_rendered_for_article(self):
        metadata = {
            'entry_type': 'article',
            'title': 'Test Article',
            'authors': 'Author, Test',
            'year': '2023',
            'journal': 'Test Journal',
            'publisher': 'Elsevier',
            'doi': '10.1016/test'
        }
        bibtex = self.extractor.metadata_to_bibtex(metadata, citation_key='author2023test')
        self.assertNotIn('publisher', bibtex)

    def test_biorxiv_howpublished(self):
        metadata = {
            'entry_type': 'misc',
            'type': 'biorxiv',
            'title': 'A bioRxiv preprint',
            'authors': 'Author, Test',
            'year': '2023',
            'doi': '10.1101/2023.01.01.123456',
            'preprint_source': 'biorxiv'
        }
        bibtex = self.extractor.metadata_to_bibtex(metadata, citation_key='author2023biorxiv')
        self.assertIn('howpublished = {bioRxiv}', bibtex)

    def test_medrxiv_howpublished(self):
        metadata = {
            'entry_type': 'misc',
            'type': 'medrxiv',
            'title': 'A medRxiv preprint',
            'authors': 'Author, Test',
            'year': '2023',
            'doi': '10.1101/2023.02.02.234567',
            'preprint_source': 'medrxiv'
        }
        bibtex = self.extractor.metadata_to_bibtex(metadata, citation_key='author2023medrxiv')
        self.assertIn('howpublished = {medRxiv}', bibtex)

    def test_arxiv_howpublished(self):
        metadata = {
            'entry_type': 'misc',
            'type': 'arxiv',
            'title': 'An arXiv preprint',
            'authors': 'Author, Test',
            'year': '2023',
            'url': 'https://arxiv.org/abs/2301.00001'
        }
        bibtex = self.extractor.metadata_to_bibtex(metadata, citation_key='author2023arxiv')
        self.assertIn('howpublished = {arXiv}', bibtex)


# ---------------------------------------------------------------------------
# Confidence scorer tests (pure logic, no mock)
# ---------------------------------------------------------------------------

class TestConfidenceScorer(unittest.TestCase):

    def setUp(self):
        self.extractor = MetadataExtractor()

    def test_exact_title_match_high_confidence(self):
        confidence = self.extractor._compute_title_confidence(
            'Deep Residual Learning for Image Recognition',
            'Deep Residual Learning for Image Recognition',
            'He',
            [{'family': 'He', 'given': 'Kaiming'}],
            '2016',
            {'published-print': {'date-parts': [[2016]]}}
        )
        self.assertGreaterEqual(confidence, 0.85)

    def test_similar_title_medium_confidence(self):
        confidence = self.extractor._compute_title_confidence(
            'Deep Residual Learning for Image Recognition',
            'Deep Residual Learning for Visual Recognition',
            'Smith',  # Different author
            [{'family': 'Jones', 'given': 'Bob'}],
            '2016',
            {'published-print': {'date-parts': [[2016]]}}
        )
        # Similar but not exact, different author → around 0.7-0.84
        self.assertGreater(confidence, 0.5)
        self.assertLess(confidence, 1.0)

    def test_different_title_low_confidence(self):
        confidence = self.extractor._compute_title_confidence(
            'Deep Residual Learning for Image Recognition',
            'Quantum Computing Applications in Chemistry',
            'He',
            [{'family': 'He'}],
            '2016',
            {'published-print': {'date-parts': [[2016]]}}
        )
        self.assertLess(confidence, 0.50)

    def test_year_penalty(self):
        base_confidence = self.extractor._compute_title_confidence(
            'Deep Residual Learning for Image Recognition',
            'Deep Residual Learning for Image Recognition',
            'He',
            [{'family': 'He'}],
            '2016',
            {'published-print': {'date-parts': [[2016]]}}
        )
        penalized_confidence = self.extractor._compute_title_confidence(
            'Deep Residual Learning for Image Recognition',
            'Deep Residual Learning for Image Recognition',
            'He',
            [{'family': 'He'}],
            '2016',
            {'published-print': {'date-parts': [[2020]]}}  # 4 years diff
        )
        self.assertGreater(base_confidence, penalized_confidence)
        self.assertAlmostEqual(base_confidence - penalized_confidence, 0.20, places=1)


# ---------------------------------------------------------------------------
# Title normalization and author extraction tests
# ---------------------------------------------------------------------------

class TestHelpers(unittest.TestCase):

    def test_normalize_title(self):
        result = MetadataExtractor._normalize_title('Deep Residual Learning: A Review!')
        self.assertEqual(result, 'deep residual learning a review')

    def test_normalize_title_collapses_whitespace(self):
        result = MetadataExtractor._normalize_title('  Deep   Residual   Learning  ')
        self.assertEqual(result, 'deep residual learning')

    def test_extract_first_author_family_comma(self):
        result = MetadataExtractor._extract_first_author_family('He, Kaiming and Zhang, Xiangyu')
        self.assertEqual(result, 'He')

    def test_extract_first_author_family_space(self):
        result = MetadataExtractor._extract_first_author_family('Kaiming He and Xiangyu Zhang')
        self.assertEqual(result, 'He')

    def test_extract_first_author_family_empty(self):
        result = MetadataExtractor._extract_first_author_family('')
        self.assertEqual(result, '')


# ---------------------------------------------------------------------------
# Provider-level tests (mock self.session.get)
# ---------------------------------------------------------------------------

class TestSemanticScholar(unittest.TestCase):

    def setUp(self):
        self.extractor = MetadataExtractor()

    @patch.object(MetadataExtractor, '_query_semantic_scholar')
    def test_semantic_scholar_success(self, mock_s2):
        """S2 returns DOI → verify correct extraction."""
        mock_s2.return_value = {
            'doi': '10.1038/s41586-021-03819-2',
            'venue': 'Nature',
            'year': 2021,
            'title': 'Highly accurate protein structure prediction'
        }

        result = self.extractor._query_semantic_scholar('2103.14030')
        self.assertIsNotNone(result)
        self.assertEqual(result['doi'], '10.1038/s41586-021-03819-2')

    def test_semantic_scholar_404(self):
        """Paper not found → return None."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch.object(self.extractor.session, 'get', return_value=mock_response):
            result = self.extractor._query_semantic_scholar('9999.99999')
            self.assertIsNone(result)

    def test_semantic_scholar_429_retry(self):
        """First call 429, second call success → verify retry."""
        mock_429 = MagicMock()
        mock_429.status_code = 429

        mock_200 = MagicMock()
        mock_200.status_code = 200
        mock_200.json.return_value = {
            'externalIds': {'DOI': '10.1234/test'},
            'venue': 'Test',
            'year': 2021,
            'title': 'Test'
        }

        with patch.object(self.extractor.session, 'get', side_effect=[mock_429, mock_200]):
            with patch('time.sleep'):  # Skip actual sleep
                result = self.extractor._query_semantic_scholar('2103.14030')
                self.assertIsNotNone(result)
                self.assertEqual(result['doi'], '10.1234/test')


class TestBioRxivProvider(unittest.TestCase):

    def setUp(self):
        self.extractor = MetadataExtractor()

    def test_biorxiv_pubs_api_published(self):
        """pubs API returns published_doi → cascade to CrossRef."""
        mock_pubs_response = MagicMock()
        mock_pubs_response.status_code = 200
        mock_pubs_response.json.return_value = {
            'collection': [{'published_doi': '10.1038/s41586-021-03819-2'}]
        }

        mock_crossref_response = MagicMock()
        mock_crossref_response.status_code = 200
        mock_crossref_response.json.return_value = {
            'message': {
                'type': 'journal-article',
                'title': ['Test Paper'],
                'author': [{'family': 'Test', 'given': 'Author'}],
                'container-title': ['Nature'],
                'published-print': {'date-parts': [[2021]]},
                'volume': '596',
                'page': '583-589',
                'publisher': 'Springer'
            }
        }

        with patch.object(self.extractor.session, 'get', side_effect=[mock_pubs_response, mock_crossref_response]):
            result = self.extractor.extract_from_biorxiv('10.1101/2021.04.29.21256344', server='biorxiv')
            self.assertEqual(result.status, 'upgraded')
            self.assertIsNotNone(result.metadata)
            self.assertEqual(result.metadata.get('preprint_source'), 'biorxiv')

    def test_biorxiv_pubs_api_not_published(self):
        """No published_doi → return preprint metadata from details API."""
        mock_pubs_response = MagicMock()
        mock_pubs_response.status_code = 200
        mock_pubs_response.json.return_value = {'collection': [{}]}

        mock_details_response = MagicMock()
        mock_details_response.status_code = 200
        mock_details_response.json.return_value = {
            'collection': [{
                'title': 'Unpublished Preprint',
                'authors': 'Author, Test',
                'date': '2023-01-15'
            }]
        }

        with patch.object(self.extractor.session, 'get', side_effect=[mock_pubs_response, mock_details_response]):
            result = self.extractor.extract_from_biorxiv('10.1101/2023.01.01.123456', server='biorxiv')
            self.assertEqual(result.status, 'found')
            self.assertEqual(result.metadata['title'], 'Unpublished Preprint')


class TestCrossRefTitleSearch(unittest.TestCase):

    def setUp(self):
        self.extractor = MetadataExtractor()

    def test_crossref_title_search_posted_content_filtered(self):
        """First result is posted-content → skip, take next journal-article."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'message': {
                'items': [
                    {
                        'type': 'posted-content',
                        'DOI': '10.1101/preprint',
                        'title': ['Deep Learning for Images'],
                        'author': [{'family': 'He'}],
                        'published-print': {'date-parts': [[2016]]}
                    },
                    {
                        'type': 'journal-article',
                        'DOI': '10.1234/published',
                        'title': ['Deep Learning for Images'],
                        'author': [{'family': 'He'}],
                        'published-print': {'date-parts': [[2016]]}
                    }
                ]
            }
        }

        with patch.object(self.extractor.session, 'get', return_value=mock_response):
            result = self.extractor._crossref_title_search(
                'Deep Learning for Images', 'He', '2016'
            )
            self.assertIsNotNone(result)
            self.assertEqual(result['doi'], '10.1234/published')

    def test_crossref_title_search_no_match(self):
        """No results above threshold → return None."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'message': {
                'items': [
                    {
                        'type': 'journal-article',
                        'DOI': '10.1234/unrelated',
                        'title': ['Completely Unrelated Paper About Chemistry'],
                        'author': [{'family': 'Smith'}],
                        'published-print': {'date-parts': [[2020]]}
                    }
                ]
            }
        }

        with patch.object(self.extractor.session, 'get', return_value=mock_response):
            result = self.extractor._crossref_title_search(
                'Deep Residual Learning for Image Recognition', 'He', '2016'
            )
            self.assertIsNone(result)


# ---------------------------------------------------------------------------
# arXiv cascade integration tests (mock all HTTP)
# ---------------------------------------------------------------------------

class TestArXivCascade(unittest.TestCase):

    def setUp(self):
        self.extractor = MetadataExtractor()

    def _make_arxiv_xml(self, doi=None):
        """Build minimal arXiv Atom XML for testing."""
        doi_tag = f'<arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">{doi}</arxiv:doi>' if doi else ''
        return f'''<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom"
              xmlns:arxiv="http://arxiv.org/schemas/atom">
          <entry>
            <title>Test Paper Title</title>
            <author><name>Test Author</name></author>
            <published>2021-03-01T00:00:00Z</published>
            <summary>Abstract here</summary>
            {doi_tag}
          </entry>
        </feed>'''

    def test_cascade_arxiv_doi_found(self):
        """arXiv API has DOI → upgrade via CrossRef."""
        mock_arxiv = MagicMock()
        mock_arxiv.status_code = 200
        mock_arxiv.content = self._make_arxiv_xml(doi='10.1038/test').encode()

        mock_crossref = MagicMock()
        mock_crossref.status_code = 200
        mock_crossref.json.return_value = {
            'message': {
                'type': 'journal-article',
                'title': ['Test Paper Title'],
                'author': [{'family': 'Author', 'given': 'Test'}],
                'container-title': ['Nature'],
                'published-print': {'date-parts': [[2021]]},
                'publisher': 'Springer'
            }
        }

        with patch.object(self.extractor.session, 'get', side_effect=[mock_arxiv, mock_crossref]):
            result = self.extractor.extract_from_arxiv_structured('2103.14030')
            self.assertEqual(result.status, 'upgraded')
            self.assertEqual(result.metadata['preprint_source'], 'arxiv')

    def test_cascade_s2_fallback(self):
        """arXiv has no DOI, S2 has DOI → upgrade."""
        mock_arxiv = MagicMock()
        mock_arxiv.status_code = 200
        mock_arxiv.content = self._make_arxiv_xml(doi=None).encode()

        mock_s2 = MagicMock()
        mock_s2.status_code = 200
        mock_s2.json.return_value = {
            'externalIds': {'DOI': '10.1038/test'},
            'venue': 'Nature',
            'year': 2021,
            'title': 'Test'
        }

        mock_crossref = MagicMock()
        mock_crossref.status_code = 200
        mock_crossref.json.return_value = {
            'message': {
                'type': 'journal-article',
                'title': ['Test Paper Title'],
                'author': [{'family': 'Author', 'given': 'Test'}],
                'container-title': ['Nature'],
                'published-print': {'date-parts': [[2021]]},
                'publisher': 'Springer'
            }
        }

        with patch.object(self.extractor.session, 'get', side_effect=[mock_arxiv, mock_s2, mock_crossref]):
            result = self.extractor.extract_from_arxiv_structured('2103.14030')
            self.assertEqual(result.status, 'upgraded')

    def test_cascade_no_published_version(self):
        """No DOI anywhere → return preprint metadata."""
        mock_arxiv = MagicMock()
        mock_arxiv.status_code = 200
        mock_arxiv.content = self._make_arxiv_xml(doi=None).encode()

        mock_s2 = MagicMock()
        mock_s2.status_code = 404

        mock_crossref_search = MagicMock()
        mock_crossref_search.status_code = 200
        mock_crossref_search.json.return_value = {'message': {'items': []}}

        with patch.object(self.extractor.session, 'get', side_effect=[mock_arxiv, mock_s2, mock_crossref_search]):
            result = self.extractor.extract_from_arxiv_structured('2103.14030')
            self.assertEqual(result.status, 'found')
            self.assertEqual(result.metadata['entry_type'], 'misc')

    def test_backward_compat_extract_from_arxiv(self):
        """Original extract_from_arxiv() still returns dict or None."""
        mock_arxiv = MagicMock()
        mock_arxiv.status_code = 200
        mock_arxiv.content = self._make_arxiv_xml(doi=None).encode()

        mock_s2 = MagicMock()
        mock_s2.status_code = 404

        mock_crossref_search = MagicMock()
        mock_crossref_search.status_code = 200
        mock_crossref_search.json.return_value = {'message': {'items': []}}

        with patch.object(self.extractor.session, 'get', side_effect=[mock_arxiv, mock_s2, mock_crossref_search]):
            result = self.extractor.extract_from_arxiv('2103.14030')
            self.assertIsInstance(result, dict)
            self.assertEqual(result['entry_type'], 'misc')

    def test_malformed_xml_returns_error(self):
        """arXiv returns 200 with invalid XML → ExtractionResult(error), not exception."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'not xml at all'

        with patch.object(self.extractor.session, 'get', return_value=mock_response):
            result = self.extractor.extract_from_arxiv_structured('2103.14030')
            self.assertEqual(result.status, 'error')
            self.assertIn('invalid XML', result.reason)

    def test_malformed_xml_backward_compat(self):
        """Backward-compat extract_from_arxiv() returns None on invalid XML."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'not xml at all'

        with patch.object(self.extractor.session, 'get', return_value=mock_response):
            result = self.extractor.extract_from_arxiv('2103.14030')
            self.assertIsNone(result)


# ---------------------------------------------------------------------------
# resolve_preprint_doi tests (tries both servers)
# ---------------------------------------------------------------------------

class TestResolvePrePrintDoi(unittest.TestCase):

    def setUp(self):
        self.extractor = MetadataExtractor()

    def test_resolve_tries_medrxiv_when_biorxiv_fails(self):
        """bioRxiv pubs API fails, medRxiv succeeds → upgraded with medrxiv source."""
        # bioRxiv pubs API returns empty
        mock_biorxiv_pubs = MagicMock()
        mock_biorxiv_pubs.status_code = 200
        mock_biorxiv_pubs.json.return_value = {'collection': [{}]}

        # bioRxiv details API also empty
        mock_biorxiv_details = MagicMock()
        mock_biorxiv_details.status_code = 404

        # bioRxiv CrossRef fallback fails
        mock_biorxiv_crossref = MagicMock()
        mock_biorxiv_crossref.status_code = 404

        # medRxiv pubs API has published DOI
        mock_medrxiv_pubs = MagicMock()
        mock_medrxiv_pubs.status_code = 200
        mock_medrxiv_pubs.json.return_value = {
            'collection': [{'published_doi': '10.1234/published'}]
        }

        # CrossRef for published DOI
        mock_crossref = MagicMock()
        mock_crossref.status_code = 200
        mock_crossref.json.return_value = {
            'message': {
                'type': 'journal-article',
                'title': ['Test Paper'],
                'author': [{'family': 'Test', 'given': 'Author'}],
                'container-title': ['Test Journal'],
                'published-print': {'date-parts': [[2021]]},
                'publisher': 'Publisher'
            }
        }

        with patch.object(self.extractor.session, 'get', side_effect=[
            mock_biorxiv_pubs, mock_biorxiv_details, mock_biorxiv_crossref,
            mock_medrxiv_pubs, mock_crossref
        ]):
            result = self.extractor.resolve_preprint_doi('10.1101/2021.04.29.21256344')
            self.assertEqual(result.status, 'upgraded')
            self.assertEqual(result.metadata['preprint_source'], 'medrxiv')

    def test_resolve_skips_biorxiv_found_to_try_medrxiv_upgrade(self):
        """bioRxiv CrossRef fallback returns 'found', medRxiv upgrades → prefer upgraded."""
        # bioRxiv pubs API: no published DOI
        mock_biorxiv_pubs = MagicMock()
        mock_biorxiv_pubs.status_code = 200
        mock_biorxiv_pubs.json.return_value = {'collection': [{}]}

        # bioRxiv details API: no results
        mock_biorxiv_details = MagicMock()
        mock_biorxiv_details.status_code = 200
        mock_biorxiv_details.json.return_value = {'collection': []}

        # bioRxiv CrossRef fallback: returns the preprint DOI itself (status='found')
        mock_biorxiv_crossref = MagicMock()
        mock_biorxiv_crossref.status_code = 200
        mock_biorxiv_crossref.json.return_value = {
            'message': {
                'type': 'posted-content',
                'title': ['Preprint Title'],
                'author': [{'family': 'Test', 'given': 'Author'}],
                'container-title': [],
                'published-online': {'date-parts': [[2021]]},
                'publisher': 'Cold Spring Harbor Laboratory'
            }
        }

        # medRxiv pubs API: has published DOI
        mock_medrxiv_pubs = MagicMock()
        mock_medrxiv_pubs.status_code = 200
        mock_medrxiv_pubs.json.return_value = {
            'collection': [{'published_doi': '10.1016/j.lancet.2021.12345'}]
        }

        # CrossRef for the published DOI
        mock_published_crossref = MagicMock()
        mock_published_crossref.status_code = 200
        mock_published_crossref.json.return_value = {
            'message': {
                'type': 'journal-article',
                'title': ['Published Title'],
                'author': [{'family': 'Test', 'given': 'Author'}],
                'container-title': ['The Lancet'],
                'published-print': {'date-parts': [[2022]]},
                'publisher': 'Elsevier'
            }
        }

        with patch.object(self.extractor.session, 'get', side_effect=[
            mock_biorxiv_pubs, mock_biorxiv_details, mock_biorxiv_crossref,
            mock_medrxiv_pubs, mock_published_crossref
        ]):
            result = self.extractor.resolve_preprint_doi('10.1101/2021.04.29.21256344')
            self.assertEqual(result.status, 'upgraded')
            self.assertEqual(result.metadata['preprint_source'], 'medrxiv')
            self.assertIn('Lancet', result.metadata.get('journal', ''))

    def test_resolve_prefers_native_found_over_crossref_fallback(self):
        """bioRxiv returns found via CrossRef fallback, medRxiv returns found via
        native details API → prefer medRxiv's native result."""
        # bioRxiv pubs API: no published DOI
        mock_biorxiv_pubs = MagicMock()
        mock_biorxiv_pubs.status_code = 200
        mock_biorxiv_pubs.json.return_value = {'collection': [{}]}

        # bioRxiv details API: empty
        mock_biorxiv_details = MagicMock()
        mock_biorxiv_details.status_code = 200
        mock_biorxiv_details.json.return_value = {'collection': []}

        # bioRxiv CrossRef fallback: returns generic preprint metadata (found, non-native)
        mock_biorxiv_crossref = MagicMock()
        mock_biorxiv_crossref.status_code = 200
        mock_biorxiv_crossref.json.return_value = {
            'message': {
                'type': 'posted-content',
                'title': ['Generic Preprint'],
                'author': [{'family': 'Test', 'given': 'Author'}],
                'container-title': [],
                'published-online': {'date-parts': [[2021]]},
                'publisher': 'Cold Spring Harbor Laboratory'
            }
        }

        # medRxiv pubs API: no published DOI
        mock_medrxiv_pubs = MagicMock()
        mock_medrxiv_pubs.status_code = 200
        mock_medrxiv_pubs.json.return_value = {'collection': [{}]}

        # medRxiv details API: returns native preprint metadata (found, native)
        mock_medrxiv_details = MagicMock()
        mock_medrxiv_details.status_code = 200
        mock_medrxiv_details.json.return_value = {
            'collection': [{
                'title': 'MedRxiv Native Preprint',
                'authors': 'Test, Author',
                'date': '2021-05-01'
            }]
        }

        with patch.object(self.extractor.session, 'get', side_effect=[
            mock_biorxiv_pubs, mock_biorxiv_details, mock_biorxiv_crossref,
            mock_medrxiv_pubs, mock_medrxiv_details
        ]):
            result = self.extractor.resolve_preprint_doi('10.1101/2021.04.29.21256344')
            self.assertEqual(result.status, 'found')
            self.assertEqual(result.metadata['preprint_source'], 'medrxiv')
            self.assertEqual(result.metadata['title'], 'MedRxiv Native Preprint')


# ---------------------------------------------------------------------------
# Preprint detector tests (no mock)
# ---------------------------------------------------------------------------

class TestPrePrintDetector(unittest.TestCase):

    def test_detect_arxiv_howpublished(self):
        entry = {
            'key': 'test2021',
            'entry_type': 'misc',
            'fields': {
                'howpublished': '{arXiv}',
                'eprint': '2103.14030',
                'title': 'Test Paper'
            }
        }
        result = detect_preprint(entry)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'arxiv')
        self.assertEqual(result[1], '2103.14030')

    def test_detect_arxiv_note(self):
        entry = {
            'key': 'test2021',
            'entry_type': 'misc',
            'fields': {
                'note': 'arXiv:2103.14030',
                'title': 'Test Paper'
            }
        }
        result = detect_preprint(entry)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'arxiv')

    def test_detect_arxiv_url(self):
        entry = {
            'key': 'test2021',
            'entry_type': 'misc',
            'fields': {
                'url': 'https://arxiv.org/abs/2103.14030',
                'title': 'Test Paper'
            }
        }
        result = detect_preprint(entry)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'arxiv')

    def test_detect_arxiv_eprint(self):
        entry = {
            'key': 'test2021',
            'entry_type': 'misc',
            'fields': {
                'eprint': '2103.14030v2',
                'title': 'Test Paper'
            }
        }
        result = detect_preprint(entry)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'arxiv')
        self.assertEqual(result[1], '2103.14030')  # Version stripped

    def test_detect_biorxiv_url(self):
        entry = {
            'key': 'test2021',
            'entry_type': 'misc',
            'fields': {
                'url': 'https://www.biorxiv.org/content/10.1101/2021.04.29.21256344v1',
                'title': 'Test Paper'
            }
        }
        result = detect_preprint(entry)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'biorxiv')

    def test_detect_preprint_doi_misc(self):
        """DOI-only 10.1101/ entry → preprint_doi (server unknown)."""
        entry = {
            'key': 'test2021',
            'entry_type': 'misc',
            'fields': {
                'doi': '10.1101/2021.04.29.21256344',
                'title': 'Test Paper'
            }
        }
        result = detect_preprint(entry)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'preprint_doi')

    def test_detect_medrxiv_howpublished(self):
        entry = {
            'key': 'test2021',
            'entry_type': 'misc',
            'fields': {
                'howpublished': '{medRxiv}',
                'doi': '10.1101/2021.04.29.21256344',
                'title': 'Test Paper'
            }
        }
        result = detect_preprint(entry)
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'medrxiv')

    def test_detect_regular_article_ignored(self):
        entry = {
            'key': 'test2021',
            'entry_type': 'article',
            'fields': {
                'doi': '10.1038/s41586-021-03819-2',
                'journal': 'Nature',
                'title': 'Published Paper'
            }
        }
        result = detect_preprint(entry)
        self.assertIsNone(result)

    def test_detect_inproceedings_ignored(self):
        entry = {
            'key': 'he2016deep',
            'entry_type': 'inproceedings',
            'fields': {
                'doi': '10.1109/CVPR.2016.90',
                'booktitle': 'IEEE CVPR',
                'title': 'Deep Residual Learning'
            }
        }
        result = detect_preprint(entry)
        self.assertIsNone(result)


# ---------------------------------------------------------------------------
# BibTeX parser tests
# ---------------------------------------------------------------------------

class TestBibParser(unittest.TestCase):

    def test_parse_simple_entry(self):
        bib = '''@article{test2021,
  author = {Author, Test},
  title = {Test Paper},
  journal = {Nature},
  year = {2021}
}'''
        entries = parse_bib_entries(bib)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]['key'], 'test2021')
        self.assertEqual(entries[0]['entry_type'], 'article')
        self.assertEqual(entries[0]['fields']['author'], 'Author, Test')

    def test_parse_multiple_entries(self):
        bib = '''@article{first2021,
  title = {First}
}

@misc{second2022,
  title = {Second},
  howpublished = {arXiv}
}'''
        entries = parse_bib_entries(bib)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]['key'], 'first2021')
        self.assertEqual(entries[1]['key'], 'second2022')

    def test_parse_nested_braces(self):
        bib = '''@article{test2021,
  title = {{Deep {Residual} Learning}}
}'''
        entries = parse_bib_entries(bib)
        self.assertEqual(len(entries), 1)
        # Double braces: outer pair is value delimiter, inner pair preserved
        self.assertEqual(entries[0]['fields']['title'], '{Deep {Residual} Learning}')


# ---------------------------------------------------------------------------
# identify_type tests for bioRxiv/medRxiv
# ---------------------------------------------------------------------------

class TestIdentifyType(unittest.TestCase):

    def setUp(self):
        self.extractor = MetadataExtractor()

    def test_bare_preprint_doi_prefix(self):
        """Bare 10.1101/ DOI → preprint_doi (can't distinguish biorxiv vs medrxiv)."""
        id_type, clean_id = self.extractor.identify_type('10.1101/2021.04.29.21256344')
        self.assertEqual(id_type, 'preprint_doi')
        self.assertEqual(clean_id, '10.1101/2021.04.29.21256344')

    def test_regular_doi_not_preprint(self):
        id_type, clean_id = self.extractor.identify_type('10.1038/s41586-021-03819-2')
        self.assertEqual(id_type, 'doi')

    def test_biorxiv_url(self):
        """biorxiv.org URL → biorxiv (server is known from URL)."""
        id_type, clean_id = self.extractor.identify_type(
            'https://www.biorxiv.org/content/10.1101/2021.04.29.21256344v1'
        )
        self.assertEqual(id_type, 'biorxiv')

    def test_medrxiv_url(self):
        """medrxiv.org URL → medrxiv (server is known from URL)."""
        id_type, clean_id = self.extractor.identify_type(
            'https://www.medrxiv.org/content/10.1101/2021.04.29.21256344v1'
        )
        self.assertEqual(id_type, 'medrxiv')

    def test_doi_org_preprint(self):
        """doi.org with 10.1101/ → preprint_doi (can't tell server from doi.org URL)."""
        id_type, clean_id = self.extractor.identify_type(
            'https://doi.org/10.1101/2021.04.29.21256344'
        )
        self.assertEqual(id_type, 'preprint_doi')

    def test_medrxiv_url_and_bare_doi_same_behavior(self):
        """Bare DOI and doi.org URL for same 10.1101/ DOI get the same type."""
        type1, id1 = self.extractor.identify_type('10.1101/2021.04.29.21256344')
        type2, id2 = self.extractor.identify_type('https://doi.org/10.1101/2021.04.29.21256344')
        self.assertEqual(type1, type2)
        self.assertEqual(id1, id2)


# ---------------------------------------------------------------------------
# extract_from_doi journal vs booktitle tests
# ---------------------------------------------------------------------------

class TestExtractFromDoiFields(unittest.TestCase):

    def setUp(self):
        self.extractor = MetadataExtractor()

    def test_proceedings_article_has_booktitle(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'message': {
                'type': 'proceedings-article',
                'title': ['Deep Residual Learning'],
                'author': [{'family': 'He', 'given': 'Kaiming'}],
                'container-title': ['IEEE CVPR'],
                'published-print': {'date-parts': [[2016]]},
                'publisher': 'IEEE'
            }
        }

        with patch.object(self.extractor.session, 'get', return_value=mock_response):
            metadata = self.extractor.extract_from_doi('10.1109/CVPR.2016.90')
            self.assertEqual(metadata['booktitle'], 'IEEE CVPR')
            self.assertEqual(metadata['journal'], '')
            self.assertEqual(metadata['entry_type'], 'inproceedings')

    def test_journal_article_has_journal(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'message': {
                'type': 'journal-article',
                'title': ['Test Paper'],
                'author': [{'family': 'Test', 'given': 'Author'}],
                'container-title': ['Nature'],
                'published-print': {'date-parts': [[2021]]},
                'publisher': 'Springer'
            }
        }

        with patch.object(self.extractor.session, 'get', return_value=mock_response):
            metadata = self.extractor.extract_from_doi('10.1038/test')
            self.assertEqual(metadata['journal'], 'Nature')
            self.assertEqual(metadata['booktitle'], '')
            self.assertEqual(metadata['entry_type'], 'article')


if __name__ == '__main__':
    unittest.main()
