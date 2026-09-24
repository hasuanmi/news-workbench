import unittest
from unittest.mock import patch, AsyncMock
from bs4 import BeautifulSoup
from app.scrapers.base import Article, collect_links, is_non_news_link, fetch_list_links
from app.scrapers.generic import GenericScraper
from app.core.fetcher import FetchedHTML
from app.core.worker import _filter_stubs
from app.scrapers.registry import get_scrapers

class LinkRulesTests(unittest.IsolatedAsyncioTestCase):
    async def test_browser_detail_reparse_retains_url_and_source_type(self):
        scraper=GenericScraper()
        scraper.source_type='epaper'
        scraper.business=['daily_review']
        scraper.parse_detail=AsyncMock(side_effect=[Article(media='A',content='short'),
            Article(media='A',title='真实新闻标题',content='正文内容'*100)])
        with patch('app.scrapers.base.fetch',new=AsyncMock(side_effect=[('short','http'),('long','playwright')])), patch('app.core.settings.playwright_enabled',return_value=True):
            article=await scraper.fetch_detail('https://example.com/2026/09/story.html')
        self.assertEqual(article.url,'https://example.com/2026/09/story.html')
        self.assertEqual(article.source_type,'epaper')
        self.assertEqual(article.scrape_method,'playwright')
        self.assertEqual(article.business,['daily_review'])

    def test_verified_configuration_does_not_enable_unverified_sibling_sources(self):
        config = {'media':'test','scraper':'generic','source_ids':['verified-source'],
                  'entry_urls':['https://example.com/']}
        with patch('app.scrapers.registry.load_sources',return_value=[config]):
            self.assertEqual(len(get_scrapers(media='test',source_id='verified-source')),1)
            self.assertEqual(get_scrapers(media='test',source_id='other-source'),[])

    def test_utility_pages_are_excluded_without_suppressing_news_about_licences(self):
        html='''<a href="/web/xukezheng/index.html">互联网新闻信息服务许可证</a>
        <a href="/beian.html">网站备案信息查询</a>
        <footer><a href="/qualifications.html">企业资质公示信息</a></footer>
        <a href="/paperindex.htm">人民日报海外版</a>
        <a href="/node_01.html">第一版今日要闻</a>
        <a href="/2026/09/24/12345.html">我市发放首张新型许可证</a>'''
        links=collect_links(BeautifulSoup(html,'lxml'),'https://example.com/',allowed_hosts=['example.com'])
        self.assertEqual([x['title'] for x in links],['我市发放首张新型许可证'])
        self.assertFalse(is_non_news_link('https://example.com/news/123.html','互联网新闻信息服务许可证发放流程调整'))
        self.assertEqual(_filter_stubs([{'url':'https://example.com/xukezheng.htm','title':'许可证资料查询'}]),[])
        for url in ('https://example.com/list_27260', 'https://example.com/rmtgzs/',
                    'https://example.com/jiandu/index.htm',
                    'https://club.qingdaonews.com/touch/list_1003_2_0_1_0.htm',
                    'https://m.voc.com.cn/portal/public_report?project=1&org_id=214',
                    'https://vote1.qingdaonews.com/branch/news/202002/ACshow/pc.php',
                    'https://club.qingdaonews.com/showAnnounce_2_7732491_1_0.htm',
                    'https://m.thepaper.cn/download?id=2',
                    'https://image.thepaper.cn/apk/thepaper_thepapercn_12.0.0.apk'):
            self.assertTrue(is_non_news_link(url))
        self.assertFalse(is_non_news_link('https://example.com/2026/09/24/123/index.html'))
        self.assertFalse(is_non_news_link('https://example.com/news/12345678/'))

    def test_app_download_does_not_enter_the_tenth_article_slot(self):
        stubs = [{'url':f'https://www.thepaper.cn/newsDetail_forward_{123450+i}',
                  'title':f'今日新闻报道标题{i}'} for i in range(9)]
        stubs.append({'url':'https://m.thepaper.cn/download?id=2','title':'Android版'})
        filtered = _filter_stubs(stubs)
        self.assertEqual(len(filtered), 9)
        self.assertTrue(all('newsDetail_forward_' in row['url'] for row in filtered))

    def test_subdomains_are_allowed_but_suffix_lookalikes_are_not(self):
        html='''<a href="https://news.example.com/2026/a.html">真实新闻标题内容</a>
        <a href="https://badexample.com/2026/b.html">伪相似域名链接</a>'''
        links=collect_links(BeautifulSoup(html,'lxml'),'https://www.example.com/',allowed_hosts=['example.com'])
        self.assertEqual(len(links),1)
        self.assertIn('news.example.com',links[0]['url'])

    async def test_redirect_path_and_html_base_are_preserved(self):
        html=FetchedHTML('<base href="./edition/"><a href="story.html">今日重大新闻报道</a>',
                         'https://news.example.com/paper/2026/09/24/index.html')
        with patch('app.scrapers.base.fetch',new=AsyncMock(return_value=(html,'http'))), patch('app.scrapers.base._record_list_method'):
            links,_=await fetch_list_links('http://www.example.com/paper',allowed_hosts=['example.com'],min_links=1)
        self.assertEqual(links[0]['url'],'https://news.example.com/paper/2026/09/24/edition/story.html')

if __name__=='__main__':unittest.main()
