import unittest
from unittest.mock import AsyncMock, patch
from poc_ingest_real import run_source
from app.scrapers.base import Article


class SourceBindingTests(unittest.IsolatedAsyncioTestCase):
    def source(self, kind='website', method='html'):
        return dict(source_id='source-A', media_id='media-A', media_name='A',
                    source_url='https://requested.example/list', source_type=kind, crawl_method=method)

    async def test_exact_url_identity_and_type_reach_ingest(self):
        for kind, method in [('website', 'html'), ('epaper', 'epaper')]:
            with self.subTest(kind=kind):
                source = self.source(kind, method)
                scraper = type('Scraper', (), {})()
                scraper.entry_urls = ['https://wrong-default.example/']
                scraper.list_articles = AsyncMock(return_value=[{'url':'https://requested.example/article'}])
                scraper.fetch_detail = AsyncMock(return_value=Article(media='A', title='A specific article',
                    url='https://requested.example/article', content='body ' * 100, word_count=400))
                client = type('Client', (), {})()
                client.get_queue = AsyncMock(side_effect=AssertionError('must not reselect source'))
                client.push_articles = AsyncMock(return_value={'success':True, 'failed':0, 'inserted':1,
                    'perSource':[{'sourceId':'source-A','ok':True}]})
                with patch('poc_ingest_real.get_scrapers', return_value=[({},scraper)]), patch('poc_ingest_real.asyncio.sleep', new_callable=AsyncMock):
                    result = await run_source(source, 'run', 'attempt', client=client)
                self.assertTrue(result['success'])
                self.assertEqual(scraper.entry_urls, [source['source_url']])
                client.get_queue.assert_not_called()
                batch = client.push_articles.call_args.args[0]
                self.assertEqual(batch[0]['source_id'], source['source_id'])
                self.assertEqual(batch[0]['articles'][0]['source_id'], source['source_id'])
                self.assertEqual(batch[0]['articles'][0]['source_type'], kind)
                self.assertEqual(batch[0]['articles'][0]['scrape_method'], method)
                for key in ('source_id','media_id','source_url','source_type','crawl_method'):
                    self.assertEqual(result[key], source[key])

    async def test_missing_parser_is_terminal_configuration_failure(self):
        client = type('Client', (), {'push_articles':AsyncMock()})()
        with patch('poc_ingest_real.get_scrapers', return_value=[]):
            result = await run_source(self.source(), 'r', 'a', client=client)
        self.assertEqual(result['error_code'], 'configuration_missing')
        self.assertFalse(result['retryable'])
        client.push_articles.assert_not_called()

    async def test_manual_missing_url_and_type_mismatch_cannot_fallback(self):
        for override, code in [({'crawl_method':'manual'},'manual_source'),
                               ({'source_type':'manual'},'manual_source'),
                               ({'source_url':None},'invalid_source_url'),
                               ({'source_url':'bad://url'},'invalid_source_url'),
                               ({'source_type':'epaper'},'unsupported_source')]:
            with self.subTest(override=override), patch('poc_ingest_real.get_scrapers') as registry:
                result = await run_source({**self.source(),**override},'r','a')
                self.assertFalse(result['success'])
                self.assertEqual(result['error_code'],code)
                registry.assert_not_called()

    async def test_wrong_ingest_source_or_zero_accepted_is_not_success(self):
        for response in [dict(success=True,inserted=1,perSource=[dict(sourceId='other',ok=True)]),
                         dict(success=True,inserted=0,invalid=1,perSource=[dict(sourceId='source-A',ok=True)])]:
            scraper = type('Scraper', (), {})()
            scraper.list_articles=AsyncMock(return_value=[{'url':'https://requested.example/article'}])
            scraper.fetch_detail=AsyncMock(return_value=Article(media='A',title='Article',content='text '*100,url='https://requested.example/article'))
            client=type('Client', (), {'push_articles':AsyncMock(return_value=response)})()
            with patch('poc_ingest_real.get_scrapers', return_value=[({},scraper)]), patch('poc_ingest_real.asyncio.sleep', new_callable=AsyncMock):
                result=await run_source(self.source(),'r','a',client=client)
            self.assertFalse(result['success'])
            self.assertEqual(result['error_code'],'ingest_failed')


if __name__ == '__main__':
    unittest.main()
