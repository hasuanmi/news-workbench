# media 与 media_source 对应关系（2026-09-24）

生产 Supabase 只读查询时间：北京时间 **2026-09-24 16:57:13**。按 media.id 关联 media_source.media_id；没有按媒体名称合并不同记录。两张表均完整分页读取并校验 count，无孤立 source。未修改数据库或代码配置。

## 总体结果

| 项目 | 数量 |
| --- | ---: |
| media | 135 |
| media_source | 322 |
| source_type=website | 284 |
| source_type=epaper | 38 |
| source_type=manual | 0 |
| 其他 source_type | 0 |
| enabled=true 的 source | 322 |
| enabled=false / 未知状态的 source | 0 / 0 |
| source 数 >3 的媒体 | 0 |

56 家各有 3 个 source，75 家各有 2 个，4 家各有 1 个；合计 135 家、322 个 source。135 家媒体本身也全部 enabled=true、monitor_clue=true。

注意 source_type 与 crawl_method 是不同字段：crawl_method 分布为 html=284、epaper=12、manual=26。26 条 manual 抓取方式记录均在 epaper 类型中，不是 source_type=manual。

## 284 源逐 ID 核对

对照原始 run `e3f6940c-52f7-44b8-8566-f4fdc2ad4aa0`：

- 284 个唯一 source ID 均存在，当前 **enabled=true 284 个，disabled 0 个，状态未知 0 个**。
- 全部 source_type=website，全部 crawl_method=html；源身份字段与执行快照无变化。
- 未发现 disabled 源或 disabled 媒体被包含；旧审计库存快照中这 284 条也全部 enabled=true。
- 当前全部启用的 website ID 集合与这次 284 源快照完全相同，没有漏入/新增差异。
- 另外 38 个 enabled epaper 不属于本次 284 网站源执行范围。
- 运行时队列接口有 enabled=true 数据库筛选；运行快照未保存 enabled 字段，因此历史状态证据来自队列过滤代码和前后库存对照，不是假称逐条运行快照自带启用状态。

## 同媒体、同 URL 重复

以 media_id + source_url **字符串完全相同**作为主口径：

- **95 组 / 95 家媒体 / 195 条 source 记录**。若每个媒体-URL 组合保留一条，存在 **100 条重复冗余**，总库对应 222 个不同媒体-URL 组合。
- 其中 94 组类型一致、1 组混合类型；这只是重复候选统计，不代表可以不核对业务和文章关联就直接删除。
- 284 网站源内部有 **95 组、194 条重复组成员、99 条冗余**；按媒体-URL 去重后为 **185 个入口**。284 是不同 source ID 数，不是 284 个不同网站入口。
- 对 URL 仅做标准格式化（保留协议、路径、查询参数、fragment，不把 http 与 https 合并）后，组数仍为 95，涉及 197 条记录，冗余 102 条。新增格式差异来自羊城晚报的 http://www.ycwb.com 与末尾带 / 的版本、天山网的 https://www.ts.cn 与末尾带 / 的版本。
- 广东广播电视台同一 URL https://www.gdtv.cn/channels/2 存在 website×2 和 epaper×1；后者 crawl_method=manual。该组存在类型差异，需核对配置，不能直接混删。

完整 source ID、URL、类型、启用状态、创建时间及是否属于 284 的明细见 [重复记录 CSV](media-source-duplicates-2026-09-24.csv)。

## 135 家媒体列表：按 source 总数降序

同数量按媒体中文名称排序。下表总数包含 website 和 epaper；所有行 manual=0、其他类型=0、disabled=0、enabled=总数。website 列也就是该媒体在本次 284 中的 source 数。“重复冗余”表示同媒体同 URL 的每组条数减 1，包含跨类型的重复候选。

| 序号 | 媒体 | source总数 | website | epaper | 重复冗余 |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 北京广播电视台 | 3 | 2 | 1 | 0 |
| 2 | 常德市广播电视台 | 3 | 2 | 1 | 0 |
| 3 | 常州广播电视台 | 3 | 3 | 0 | 1 |
| 4 | 大连新闻传媒集团 | 3 | 2 | 1 | 0 |
| 5 | 大众日报 | 3 | 3 | 0 | 1 |
| 6 | 东莞广播电视台 | 3 | 3 | 0 | 2 |
| 7 | 东莞日报社 | 3 | 3 | 0 | 1 |
| 8 | 福建日报 | 3 | 3 | 0 | 1 |
| 9 | 福建省广播影视集团 | 3 | 2 | 1 | 0 |
| 10 | 甘肃广播电视总台 | 3 | 3 | 0 | 1 |
| 11 | 广东广播电视台 | 3 | 2 | 1 | 2 |
| 12 | 广西广播电视台 | 3 | 3 | 0 | 2 |
| 13 | 广西日报 | 3 | 2 | 1 | 0 |
| 14 | 贵州日报 | 3 | 2 | 1 | 0 |
| 15 | 海南日报 | 3 | 2 | 1 | 0 |
| 16 | 河南广播电视台 | 3 | 3 | 0 | 1 |
| 17 | 黑龙江广播电视台 | 3 | 3 | 0 | 2 |
| 18 | 湖北广播电视台 | 3 | 3 | 0 | 1 |
| 19 | 湖南广播电视台 | 3 | 2 | 1 | 1 |
| 20 | 湖州市新闻传媒中心 | 3 | 3 | 0 | 1 |
| 21 | 华龙网 | 3 | 3 | 0 | 1 |
| 22 | 吉林广播电视台 | 3 | 3 | 0 | 1 |
| 23 | 吉林日报 | 3 | 2 | 1 | 0 |
| 24 | 江西日报 | 3 | 3 | 0 | 1 |
| 25 | 解放日报 | 3 | 3 | 0 | 1 |
| 26 | 昆明日报 | 3 | 2 | 1 | 0 |
| 27 | 辽宁广播电视台 | 3 | 2 | 1 | 0 |
| 28 | 辽宁日报 | 3 | 3 | 0 | 1 |
| 29 | 内蒙古广播电视台 | 3 | 3 | 0 | 1 |
| 30 | 内蒙古日报 | 3 | 3 | 0 | 1 |
| 31 | 宁夏日报报业集团 | 3 | 3 | 0 | 0 |
| 32 | 黔南广播电视台 | 3 | 2 | 1 | 0 |
| 33 | 人民日报 | 3 | 2 | 1 | 1 |
| 34 | 山东广播电视台 | 3 | 2 | 1 | 0 |
| 35 | 上观新闻 | 3 | 3 | 0 | 2 |
| 36 | 深圳广播电影电视集团 | 3 | 3 | 0 | 1 |
| 37 | 十堰日报社 | 3 | 2 | 1 | 0 |
| 38 | 石家庄日报 | 3 | 2 | 1 | 1 |
| 39 | 天津海河传媒中心（天津广播电视台） | 3 | 2 | 1 | 0 |
| 40 | 天山网 | 3 | 3 | 0 | 1 |
| 41 | 潍坊日报社 | 3 | 2 | 1 | 0 |
| 42 | 西藏广播电视台 | 3 | 3 | 0 | 0 |
| 43 | 西藏日报 | 3 | 3 | 0 | 1 |
| 44 | 新疆广播电视台 | 3 | 3 | 0 | 1 |
| 45 | 新疆日报 | 3 | 2 | 1 | 0 |
| 46 | 徐州广播电视台 | 3 | 3 | 0 | 1 |
| 47 | 盐阜大众报报业集团 | 3 | 2 | 1 | 0 |
| 48 | 羊城晚报 | 3 | 3 | 0 | 1 |
| 49 | 宜春市广播电视台 | 3 | 2 | 1 | 0 |
| 50 | 云南日报 | 3 | 3 | 0 | 1 |
| 51 | 浙江广播电视集团 | 3 | 3 | 0 | 1 |
| 52 | 郑州报业集团 | 3 | 2 | 1 | 0 |
| 53 | 中国航天报 | 3 | 2 | 1 | 1 |
| 54 | 中国青年报 | 3 | 2 | 1 | 1 |
| 55 | 中国文化报 | 3 | 3 | 0 | 1 |
| 56 | 珠海广播电视台 | 3 | 2 | 1 | 1 |
| 57 | 安徽广播电视台 | 2 | 2 | 0 | 1 |
| 58 | 安徽日报 | 2 | 2 | 0 | 1 |
| 59 | 北京日报 | 2 | 2 | 0 | 1 |
| 60 | 承德广播电视台 | 2 | 2 | 0 | 1 |
| 61 | 重庆广播电视集团 | 2 | 2 | 0 | 1 |
| 62 | 重庆日报 | 2 | 2 | 0 | 1 |
| 63 | 法治日报 | 2 | 1 | 1 | 0 |
| 64 | 福州日报社 | 2 | 2 | 0 | 1 |
| 65 | 甘肃日报 | 2 | 2 | 0 | 1 |
| 66 | 工人日报 | 2 | 1 | 1 | 0 |
| 67 | 光明日报 | 2 | 1 | 1 | 0 |
| 68 | 广州日报报业集团 | 2 | 2 | 0 | 1 |
| 69 | 贵州广播电视台 | 2 | 2 | 0 | 1 |
| 70 | 海南广播电视总台 | 2 | 2 | 0 | 0 |
| 71 | 合肥报业传媒集团 | 2 | 2 | 0 | 1 |
| 72 | 河北广播电视台 | 2 | 2 | 0 | 1 |
| 73 | 河北日报 | 2 | 2 | 0 | 1 |
| 74 | 河南日报 | 2 | 1 | 1 | 0 |
| 75 | 黑龙江日报 | 2 | 2 | 0 | 1 |
| 76 | 湖北日报 | 2 | 2 | 0 | 1 |
| 77 | 湖南日报 | 2 | 2 | 0 | 1 |
| 78 | 济南广播电视台 | 2 | 2 | 0 | 1 |
| 79 | 江苏省广播电视总台 | 2 | 2 | 0 | 1 |
| 80 | 江西广播电视台 | 2 | 2 | 0 | 1 |
| 81 | 解放军报 | 2 | 1 | 1 | 0 |
| 82 | 经济参考报 | 2 | 2 | 0 | 1 |
| 83 | 经济日报 | 2 | 1 | 1 | 0 |
| 84 | 科技日报 | 2 | 1 | 1 | 0 |
| 85 | 洛阳广播电视台 | 2 | 2 | 0 | 1 |
| 86 | 湄洲日报 | 2 | 2 | 0 | 1 |
| 87 | 南方日报 | 2 | 2 | 0 | 1 |
| 88 | 南京广播电视台 | 2 | 2 | 0 | 1 |
| 89 | 宁波日报报业集团 | 2 | 2 | 0 | 1 |
| 90 | 宁夏广播电视台 | 2 | 2 | 0 | 1 |
| 91 | 农民日报 | 2 | 1 | 1 | 0 |
| 92 | 澎湃新闻 | 2 | 2 | 0 | 1 |
| 93 | 青岛日报报业集团 | 2 | 2 | 0 | 1 |
| 94 | 青海广播电视台 | 2 | 2 | 0 | 0 |
| 95 | 青海日报 | 2 | 2 | 0 | 1 |
| 96 | 求是 | 2 | 2 | 0 | 1 |
| 97 | 人民政协报 | 2 | 2 | 0 | 1 |
| 98 | 三明市融媒体中心 | 2 | 2 | 0 | 1 |
| 99 | 三峡日报 | 2 | 2 | 0 | 1 |
| 100 | 山西广播电视台 | 2 | 2 | 0 | 1 |
| 101 | 山西日报 | 2 | 2 | 0 | 1 |
| 102 | 陕西广播电视台 | 2 | 2 | 0 | 1 |
| 103 | 陕西日报 | 2 | 2 | 0 | 1 |
| 104 | 上海广播电视台 | 2 | 2 | 0 | 1 |
| 105 | 深圳报业集团 | 2 | 2 | 0 | 1 |
| 106 | 沈阳日报 | 2 | 2 | 0 | 1 |
| 107 | 四川广播电视台 | 2 | 2 | 0 | 1 |
| 108 | 四川日报 | 2 | 2 | 0 | 1 |
| 109 | 苏州广播电视总台 | 2 | 2 | 0 | 1 |
| 110 | 苏州日报社 | 2 | 2 | 0 | 1 |
| 111 | 泰州广播电视台 | 2 | 2 | 0 | 0 |
| 112 | 天津海河传媒中心（天津日报） | 2 | 2 | 0 | 1 |
| 113 | 吐鲁番日报 | 2 | 2 | 0 | 1 |
| 114 | 温州市新闻传媒中心 | 2 | 2 | 0 | 1 |
| 115 | 无锡日报报业集团 | 2 | 2 | 0 | 1 |
| 116 | 锡林郭勒盟日报 | 2 | 2 | 0 | 1 |
| 117 | 新华日报 | 2 | 2 | 0 | 1 |
| 118 | 新华社 | 2 | 1 | 1 | 0 |
| 119 | 学习时报 | 2 | 2 | 0 | 1 |
| 120 | 榆林日报 | 2 | 2 | 0 | 1 |
| 121 | 云南广播电视台 | 2 | 2 | 0 | 1 |
| 122 | 长江日报 | 2 | 2 | 0 | 1 |
| 123 | 长沙晚报社 | 2 | 2 | 0 | 1 |
| 124 | 浙江日报 | 2 | 2 | 0 | 1 |
| 125 | 中国妇女报 | 2 | 1 | 1 | 0 |
| 126 | 中国纪检监察报 | 2 | 1 | 1 | 0 |
| 127 | 中国江苏网 | 2 | 2 | 0 | 1 |
| 128 | 中国教育电视台 | 2 | 2 | 0 | 1 |
| 129 | 中国日报 | 2 | 1 | 1 | 0 |
| 130 | 中国新闻社 | 2 | 2 | 0 | 1 |
| 131 | 中央广播电视总台 | 2 | 2 | 0 | 1 |
| 132 | 广州日报 | 1 | 1 | 0 | 0 |
| 133 | 南方都市报 | 1 | 1 | 0 | 0 |
| 134 | 新快报 | 1 | 1 | 0 | 0 |
| 135 | 信息时报 | 1 | 1 | 0 | 0 |
| 合计 | 135 家 | 322 | 284 | 38 | 100 |

## 重复 URL 组（每组的完整 source ID 见 CSV）

| 媒体 | URL | source数 | 类型 | 284中条数 |
| --- | --- | ---: | --- | ---: |
| 东莞广播电视台 | https://news.sun0769.com/dg/headnews/ | 3 | website | 3 |
| 广东广播电视台 | https://www.gdtv.cn/channels/2 | 3 | website / epaper | 2 |
| 广西广播电视台 | https://news.gxtv.cn/ | 3 | website | 3 |
| 黑龙江广播电视台 | https://ljktx.dbw.cn/index.shtml | 3 | website | 3 |
| 上观新闻 | https://www.shobserver.com/home | 3 | website | 3 |
| 安徽广播电视台 | http://www.ahtv.cn | 2 | website | 2 |
| 安徽日报 | http://www.ahnews.com.cn | 2 | website | 2 |
| 北京日报 | http://www.bjd.com.cn | 2 | website | 2 |
| 常州广播电视台 | http://www.cztv.tv | 2 | website | 2 |
| 承德广播电视台 | http://www.chengde.gov.cn | 2 | website | 2 |
| 重庆广播电视集团 | http://www.cbg.cn | 2 | website | 2 |
| 重庆日报 | http://www.cqnews.net | 2 | website | 2 |
| 大众日报 | http://paper.dzwww.com | 2 | website | 2 |
| 东莞日报社 | http://www.timedg.com | 2 | website | 2 |
| 福建日报 | http://fjrb.fjdaily.com | 2 | website | 2 |
| 福州日报社 | http://www.fznews.com.cn | 2 | website | 2 |
| 甘肃广播电视总台 | http://www.gstv.com.cn | 2 | website | 2 |
| 甘肃日报 | http://gansudaily.com.cn | 2 | website | 2 |
| 广州日报报业集团 | http://www.gzdaily.com | 2 | website | 2 |
| 贵州广播电视台 | http://www.gzstv.com | 2 | website | 2 |
| 合肥报业传媒集团 | http://www.hf365.com | 2 | website | 2 |
| 河北广播电视台 | http://www.hebtv.com | 2 | website | 2 |
| 河北日报 | http://hebnews.cn | 2 | website | 2 |
| 河南广播电视台 | http://www.hntv.tv | 2 | website | 2 |
| 黑龙江日报 | http://epaper.hljnews.cn | 2 | website | 2 |
| 湖北广播电视台 | http://www.hbtv.com.cn | 2 | website | 2 |
| 湖北日报 | http://www.hbnews.net | 2 | website | 2 |
| 湖南广播电视台 | https://news.hunantv.com/ | 2 | website | 2 |
| 湖南日报 | http://www.voc.com.cn | 2 | website | 2 |
| 湖州市新闻传媒中心 | http://www.hz66.com | 2 | website | 2 |
| 华龙网 | https://www.cqliving.com | 2 | website | 2 |
| 吉林广播电视台 | http://www.jlntv.cn | 2 | website | 2 |
| 济南广播电视台 | http://www.e23.cn | 2 | website | 2 |
| 江苏省广播电视总台 | http://www.jsbc.com | 2 | website | 2 |
| 江西广播电视台 | http://www.jxgdw.cn | 2 | website | 2 |
| 江西日报 | http://www.jxnews.com.cn | 2 | website | 2 |
| 解放日报 | http://www.jfdaily.com | 2 | website | 2 |
| 经济参考报 | http://www.jjckb.cn | 2 | website | 2 |
| 辽宁日报 | http://epaper.lnd.com.cn | 2 | website | 2 |
| 洛阳广播电视台 | http://www.lytv.com.cn | 2 | website | 2 |
| 湄洲日报 | http://www.ptxw.com | 2 | website | 2 |
| 南方日报 | http://www.southcn.com | 2 | website | 2 |
| 南京广播电视台 | http://www.nbs.cn | 2 | website | 2 |
| 内蒙古广播电视台 | http://www.nmtv.cn | 2 | website | 2 |
| 内蒙古日报 | http://www.nmgnews.com.cn | 2 | website | 2 |
| 宁波日报报业集团 | http://nbjt.cnnb.com.cn | 2 | website | 2 |
| 宁夏广播电视台 | http://www.nxtv.com.cn | 2 | website | 2 |
| 澎湃新闻 | https://www.thepaper.cn | 2 | website | 2 |
| 青岛日报报业集团 | http://www.qingdaonews.com | 2 | website | 2 |
| 青海日报 | http://www.qhnews.com | 2 | website | 2 |
| 求是 | http://www.qstheory.cn | 2 | website | 2 |
| 人民日报 | https://www.people.com.cn/GB/59476/index.html | 2 | website | 2 |
| 人民政协报 | http://www.rmzxw.com.cn | 2 | website | 2 |
| 三明市融媒体中心 | http://www.smnet.com.cn | 2 | website | 2 |
| 三峡日报 | http://www.cn3x.com.cn | 2 | website | 2 |
| 山西广播电视台 | http://www.sxrtv.com | 2 | website | 2 |
| 山西日报 | http://www.sxrb.com | 2 | website | 2 |
| 陕西广播电视台 | http://www.sxtvs.com | 2 | website | 2 |
| 陕西日报 | http://www.sxdaily.com.cn | 2 | website | 2 |
| 上海广播电视台 | http://www.smg.cn | 2 | website | 2 |
| 深圳报业集团 | http://www.sznews.com | 2 | website | 2 |
| 深圳广播电影电视集团 | http://www.szmg.com.cn | 2 | website | 2 |
| 沈阳日报 | http://www.syd.com.cn | 2 | website | 2 |
| 石家庄日报 | http://www.sjzdaily.com.cn/index.shtml | 2 | website | 2 |
| 四川广播电视台 | http://www.sctv.com | 2 | website | 2 |
| 四川日报 | http://www.scol.com.cn | 2 | website | 2 |
| 苏州广播电视总台 | http://www.csztv.cn | 2 | website | 2 |
| 苏州日报社 | http://www.subaonet.com | 2 | website | 2 |
| 天津海河传媒中心（天津日报） | http://www.tianjinwe.com | 2 | website | 2 |
| 天山网 | https://www.ts.cn | 2 | website | 2 |
| 吐鲁番日报 | http://www.tlf.gov.cn | 2 | website | 2 |
| 温州市新闻传媒中心 | http://www.wzxwcm.com | 2 | website | 2 |
| 无锡日报报业集团 | http://www.wxrb.com | 2 | website | 2 |
| 西藏日报 | http://www.chinatibetnews.com | 2 | website | 2 |
| 锡林郭勒盟日报 | http://www.xlgl.gov.cn | 2 | website | 2 |
| 新华日报 | http://www.xhby.net | 2 | website | 2 |
| 新疆广播电视台 | http://www.xjtvs.com.cn | 2 | website | 2 |
| 徐州广播电视台 | http://www.xztv.com.cn | 2 | website | 2 |
| 学习时报 | http://www.studytimes.cn | 2 | website | 2 |
| 羊城晚报 | http://www.ycwb.com | 2 | website | 2 |
| 榆林日报 | http://www.ylrb.com | 2 | website | 2 |
| 云南广播电视台 | http://www.yntv.cn | 2 | website | 2 |
| 云南日报 | http://yndaily.yunnan.cn | 2 | website | 2 |
| 长江日报 | http://www.cjn.cn | 2 | website | 2 |
| 长沙晚报社 | http://www.icswb.com | 2 | website | 2 |
| 浙江广播电视集团 | http://www.cztv.com | 2 | website | 2 |
| 浙江日报 | http://zjnews.zjol.com.cn | 2 | website | 2 |
| 中国航天报 | http://www.csn.spacechina.com/ | 2 | website | 2 |
| 中国江苏网 | http://www.jschina.com.cn | 2 | website | 2 |
| 中国教育电视台 | http://www.centv.cn | 2 | website | 2 |
| 中国青年报 | https://news.cyol.com/ | 2 | website | 2 |
| 中国文化报 | http://www.ccdy.cn | 2 | website | 2 |
| 中国新闻社 | http://www.chinanews.com.cn | 2 | website | 2 |
| 中央广播电视总台 | http://www.cctv.com | 2 | website | 2 |
| 珠海广播电视台 | http://pub-zhtb.hizh.cn/shizheng/ | 2 | website | 2 |

[下载媒体列表 CSV](media-source-counts-2026-09-24.csv) · [完整统计 JSON](media-source-relationship-2026-09-24.json)
