# 媒体抓取服务 · PoC 验证报告

> 生成时间：2026-09-11 ｜ 验证环境：本地沙箱（直连目标站点，未安装 Playwright 浏览器）

## 一、每日评报 6 家媒体 scraper 实测

| 媒体 | 列表数 | 详情有效 | 正文过短 | 缺时间 | 抓取方式 | 备注 |
|---|---|---|---|---|---|---|
| 广州日报 | 176 | 3/4 | 1 | 0 | http | 纯 HTTP 可用；详情时间取列表页邻近时间，栏目待校准 |
| 南方日报 | 192 | 3/4 | 1 | 0 | http | www.southcn.com 服务端渲染可用；news. 子域为 SPA（生产用 Playwright 兜底） |
| 南方都市报 | 61 | 3/4 | 1 | 0 | http | 列表 HTTP 可用；详情时间/栏目抽取正常 |
| 新快报 | 40 | 4/4 | 0 | 0 | http | 纯 HTTP 可用；列表发现量受首页布局影响 |
| 羊城晚报 | 0 | 0/4 | 0 | 0 | - | 官网/数字报均为 JS 空壳，需 Playwright；沙箱未装浏览器，待生产验证 |
| 信息时报 | 15 | 4/4 | 0 | 0 | http | 数字报 HTTP 可用；时间从 URL 路径解析 |

## 二、全量媒体可用性扫描（来自《媒体列表.xlsx》，共 132 家）

> 推荐抓取方式分布：**HTTP 直连 86 家** ｜ **需 Playwright 19 家** ｜ **沙箱不可达 27 家**

> 说明：沙箱经代理访问，部分媒体（尤其央媒/省外媒体）报 `unreachable` 多为网络/代理限制，非真实不可达；生产服务器直连通常会更优。

### 需 Playwright 的媒体（JS 渲染/反爬，生产环境 Docker 内置 Chromium 解决）

| 媒体 | 层级 | 地区 | 官网 | 电子报 |
|---|---|---|---|---|
| 中国文化报 | 央媒 | 全国 | http://www.ccdy.cn | 官网同源 |
| 中国航天报 | 央媒 | 全国 | http://www.spacechina.com | 官网同源 |
| 内蒙古广播电视台 | 省媒 | 内蒙古 | http://www.nmtv.cn | 腾格里客户端 |
| 吉林广播电视台 | 省媒 | 吉林 | http://www.jlntv.cn | 吉视通客户端 |
| 解放日报 | 省媒 | 上海 | http://www.jfdaily.com | 解放日报数字报 |
| 上观新闻 | 省媒 | 上海 | https://www.shobserver.com | 官网同源 |
| 福建日报 | 省媒 | 福建 | http://fjrb.fjdaily.com | 福建日报数字报 |
| 湖南广播电视台 | 省媒 | 湖南 | http://www.hunantv.com | 芒果TV |
| 广东广播电视台 | 省媒 | 广东 | http://www.gdtv.cn | 触电新闻客户端 |
| 羊城晚报 | 省媒 | 广东 | http://www.ycwb.com | 羊城晚报数字报 |
| 云南日报 | 省媒 | 云南 | http://yndaily.yunnan.cn | 云南日报数字报 |
| 甘肃广播电视总台 | 省媒 | 甘肃 | http://www.gstv.com.cn | 丝路明珠网 |
| 天山网 | 省媒 | 新疆 | https://www.ts.cn | 官网同源 |
| 徐州广播电视台 | 地市级 | 江苏·徐州 | http://www.xztv.com.cn | 无线徐州客户端 |
| 盐阜大众报报业集团 | 地市级 | 江苏·盐城 | http://www.yanchengnews.com | 盐阜大众报数字报 |
| 常州广播电视台 | 地市级 | 江苏·常州 | http://www.cztv.tv | 常州日报数字报 |
| 湖州市新闻传媒中心 | 地市级 | 浙江·湖州 | http://www.hz66.com | 湖州日报数字报 |
| 宜春市广播电视台 | 地市级 | 江西·宜春 | http://www.yctv.com.cn | 宜春新闻网 |
| 广州日报报业集团 | 地市级 | 广东·广州 | http://www.gzdaily.com | 广州日报数字报 |

### 沙箱不可达媒体（建议生产环境复核）

| 媒体 | 层级 | 地区 | 官网 | 电子报 |
|---|---|---|---|---|
| 媒体名称 | 层级 | 所属地区 | 官网 | 电子报/数字版 |
| 经济参考报 | 央媒 | 全国 | http://www.jjckb.cn | 官网同源 |
| 北京广播电视台 | 省媒 | 北京 | http://www.rbc.cn | 北京时间客户端 |
| 天津海河传媒中心（天津广播电视台） | 省媒 | 天津 | http://www.tjbs.com.cn | 津云客户端 |
| 辽宁广播电视台 | 省媒 | 辽宁 | http://www.lntv.com.cn | 辽宁新闻 |
| 吉林日报 | 省媒 | 吉林 | http://jlrbszb.cnjiwang.com | 吉林日报数字报 |
| 福建省广播影视集团 | 省媒 | 福建 | http://www.fjtv.net | 海博TV |
| 江西日报 | 省媒 | 江西 | http://www.jxnews.com.cn | 江西日报数字报 |
| 山东广播电视台 | 省媒 | 山东 | http://www.sdtv.com.cn | 闪电新闻客户端 |
| 广西日报 | 省媒 | 广西 | http://www.gxnews.com.cn | 广西日报数字报 |
| 海南日报 | 省媒 | 海南 | http://www.hndaily.com | 海南日报数字报 |
| 贵州日报 | 省媒 | 贵州 | http://www.gzrbs.com.cn | 天眼新闻客户端 |
| 西藏广播电视台 | 省媒 | 西藏 | http://www.xztv.tv | 牦牦TV |
| 青海广播电视台 | 省媒 | 青海 | http://www.qhbtv.com | 长云网 |
| 宁夏日报报业集团 | 省媒 | 宁夏 | http://www.nxnews.net | 宁夏日报数字报 |
| 新疆日报 | 省媒 | 新疆 | http://www.xjdaily.com.cn | 新疆日报数字报 |
| 泰州广播电视台 | 地市级 | 江苏·泰州 | http://www.tzta.com.cn | 微泰州客户端 |
| 温州市新闻传媒中心 | 地市级 | 浙江·温州 | http://www.wzxwcm.com | 温度新闻客户端 |
| 潍坊日报社 | 地市级 | 山东·潍坊 | http://www.wfnews.com.cn | 潍坊日报数字报 |
| 珠海广播电视台 | 地市级 | 广东·珠海 | http://www.zhtv.com | 珠海传媒集团 |
| 十堰日报社 | 地市级 | 湖北·十堰 | http://www.shiyan.gov.cn/srb | 十堰日报数字报 |
| 常德市广播电视台 | 地市级 | 湖南·常德 | http://www.cdtv.com.cn | 常德融媒 |
| 郑州报业集团 | 地市级 | 河南·郑州 | http://www.zynews.com | 郑州日报数字报 |
| 石家庄日报 | 地市级 | 河北·石家庄 | http://www.sjzdaily.com.cn | 石家庄日报数字报 |
| 大连新闻传媒集团 | 地市级 | 辽宁·大连 | http://www.dlxww.com | 大连日报数字报 |
| 黔南广播电视台 | 地市级 | 贵州·黔南 | http://www.qntv.net | 黔南日报 |
| 昆明日报 | 地市级 | 云南·昆明 | http://www.kmzs.cc | 昆明日报数字报 |

## 三、结论

- 抓取服务骨架（FastAPI + fetcher + 去重 + SQLite + 日志 + 重试）已完成，全部模块导入正常。
- 每日评报 6 家中，**5 家纯 HTTP 即可稳定抓取列表+详情**（广州日报/南方日报/南方都市报/新快报/信息时报）；仅**羊城晚报**因官网为 JS 空壳需 Playwright，生产环境可正常抓取。
- 132 家媒体扫描完成：86 家可 HTTP 直连、19 家需 Playwright、27 家沙箱不可达（多为代理/网络限制，待生产复核）。
- 统一 `article` 结构已预留版面类（edition_no/is_front_page/images…）与线索类（series_name/special_url/series_articles/first_seen_at…）全部可选字段。
- 已知待办：① 羊城晚报待生产用 Playwright 验证；② 广州日报/南方日报栏目名抽取待进一步校准；③ 新闻线索 10 家（新华社/人民日报/光明日报/央视新闻/解放日报/浙江日报/河南日报/四川日报/深圳特区报 + 南方日报）暂沿用通用解析器，后续按业务补专栏/系列/专题抽取。