from pathlib import Path
from html import escape
import json

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://fazafilms.ru"
UPDATED = "2026-10-29"

LANGS = {
    "ru": {"prefix": "", "html": "ru", "label": "RU", "works": "Кейсы", "services": "Услуги", "prices": "Стоимость", "contacts": "Контакты", "cta": "Обсудить проект", "more": "Смотреть кейсы", "process": "Как мы работаем", "offer": "Что входит", "faq": "Вопросы и ответы", "world": "Студия находится во Владивостоке и реализует проекты по всей России и миру.", "footer": "Студия видеопродакшна, CG/3D и VFX. Россия · международные проекты."},
    "en": {"prefix": "/en", "html": "en", "label": "EN", "works": "Case studies", "services": "Services", "prices": "Pricing", "contacts": "Contact", "cta": "Start a project", "more": "View case studies", "process": "Our process", "offer": "What is included", "faq": "Questions and answers", "world": "Based in Vladivostok, FAZA delivers productions across Russia and worldwide.", "footer": "Video production, CG/3D and VFX studio. Russia · worldwide."},
    "zh": {"prefix": "/zh", "html": "zh-CN", "label": "中文", "works": "案例", "services": "服务", "prices": "费用", "contacts": "联系", "cta": "咨询项目", "more": "查看案例", "process": "合作流程", "offer": "服务内容", "faq": "常见问题", "world": "FAZA 位于符拉迪沃斯托克，为俄罗斯及全球客户提供制作服务。", "footer": "影视制作、CG/3D 与 VFX 工作室。俄罗斯 · 全球项目。"},
}

SERVICES = {
    "videoproduction": {
        "ru": ("Видеопродакшн полного цикла", "Создаём видео для брендов — от идеи и сценария до съёмки, 3D/VFX, звука и мастер-файлов для ТВ, кинотеатров и digital.", ["Креативная концепция, сценарий и раскадровка", "Продюсирование, кастинг, локации и съёмочная команда", "Монтаж, цвет, звук, 3D-графика и VFX"], ["Работаете за пределами Владивостока?", "Да. Съёмочные и постпродакшн-проекты реализуем по России и миру."], "видеопродакшн, студия видеопроизводства, производство видео под ключ"),
        "en": ("Full-service video production", "We create brand films from concept and script to production, CG/VFX, sound and masters for broadcast, cinema and digital.", ["Creative concept, script and storyboard", "Producing, casting, locations and production crew", "Editing, grade, sound, 3D graphics and VFX"], ["Do you work outside Vladivostok?", "Yes. We deliver productions and post-production projects across Russia and worldwide."], "video production studio, full-service production, commercial video production"),
        "zh": ("全流程影视制作", "从创意、脚本到拍摄、CG/VFX、声音与电视、影院及数字媒体成片交付，为品牌制作影像。", ["创意概念、脚本与分镜", "制片、选角、场地与摄制团队", "剪辑、调色、声音、3D 图形与 VFX"], ["可以在符拉迪沃斯托克以外合作吗？", "可以。我们在俄罗斯各地及全球提供拍摄和后期制作服务。"], "影视制作公司, 广告视频制作, 全流程视频制作"),
    },
    "commercial": {
        "ru": ("Производство рекламных роликов", "Рекламные ролики для ТВ, кинотеатров, сайтов и digital-кампаний: ясная идея, сильный визуальный образ и адаптации под площадки.", ["Идея и сценарий под коммуникационную задачу", "Игровая, предметная или комбинированная съёмка", "Версии хронометража и форматы для медиаплана"], ["Можно сделать версии для разных площадок?", "Да. Планируем горизонтальные, вертикальные и короткие версии на этапе препродакшна."], "заказать рекламный ролик, производство видеорекламы, рекламный ролик для ТВ"),
        "en": ("Commercial video production", "Commercials for broadcast, cinema, websites and digital campaigns with a clear idea, a strong visual language and platform-ready adaptations.", ["Concept and script aligned with the campaign", "Live action, product or hybrid production", "Multiple durations and platform formats"], ["Can you deliver versions for different platforms?", "Yes. Horizontal, vertical and short edits are planned in pre-production."], "commercial production company, advertising video, TV commercial production"),
        "zh": ("广告片制作", "为电视、影院、网站与数字营销活动制作广告片，兼顾清晰创意、强烈视觉与多平台适配。", ["围绕传播目标开发创意与脚本", "真人、产品或混合拍摄", "多时长及多平台版本交付"], ["可以制作不同平台的版本吗？", "可以。横版、竖版和短版会在前期制作阶段统一规划。"], "广告片制作, 品牌视频, 电视广告制作"),
    },
    "corporate-film": {
        "ru": ("Корпоративные и презентационные фильмы", "Фильм о компании, продукте или проекте: содержательная история, кинематографичная съёмка и понятная структура для клиентов, партнёров и команды.", ["Интервью, сценарная драматургия и фактура бизнеса", "Съёмка людей, производства, объектов и процессов", "Графика, инфографика, озвучивание и субтитры"], ["Готовите версии на других языках?", "Да. Предусматриваем субтитры, графику и озвучивание для международной аудитории."], "корпоративный фильм, презентационный фильм, имиджевое видео о компании"),
        "en": ("Corporate and presentation films", "A clear, cinematic story about a company, product or project for customers, partners and internal teams.", ["Interviews, narrative structure and business research", "Filming people, facilities, products and processes", "Motion graphics, voice-over and subtitles"], ["Can you prepare international versions?", "Yes. We plan subtitles, localized graphics and voice-over for global audiences."], "corporate film production, company profile video, presentation film"),
        "zh": ("企业与展示影片", "用清晰、电影化的方式讲述企业、产品或项目，面向客户、合作伙伴与内部团队。", ["采访、叙事结构与业务调研", "人物、生产、空间与流程拍摄", "动态图形、配音与字幕"], ["可以制作国际版本吗？", "可以。我们可为全球受众准备字幕、本地化图形与配音。"], "企业宣传片, 公司介绍视频, 品牌影片制作"),
    },
    "3d-motion": {
        "ru": ("3D, CGI и motion design", "Создаём продуктовые CG-ролики, 3D-анимацию и motion design для брендов, экранов и digital. Ядро пайплайна — Cinema 4D.", ["Концепт, стиль-фреймы и аниматик", "Моделирование, материалы, свет и анимация", "Рендер, композитинг, звук и адаптации"], ["Можно работать полностью удалённо?", "Да. Для CG/3D весь цикл может проходить дистанционно с согласованием этапов онлайн."], "3D ролик заказать, CGI студия, motion design, 3D анимация для бренда"),
        "en": ("3D, CGI and motion design", "Product CGI, 3D animation and motion design for brands, screens and digital platforms, built around a Cinema 4D pipeline.", ["Concept, style frames and animatic", "Modelling, materials, lighting and animation", "Rendering, compositing, sound and adaptations"], ["Can the project be delivered remotely?", "Yes. The complete CG/3D workflow can be managed remotely with online reviews."], "3D animation studio, CGI production, motion design company"),
        "zh": ("3D、CGI 与动态图形", "以 Cinema 4D 为核心，为品牌、屏幕与数字平台制作产品 CGI、3D 动画和动态图形。", ["概念、风格帧与动态预演", "建模、材质、灯光与动画", "渲染、合成、声音与版本适配"], ["项目可以完全远程完成吗？", "可以。CG/3D 全流程可远程协作并在线审片。"], "3D动画公司, CGI制作, 动态视觉设计"),
    },
    "vfx": {
        "ru": ("Съёмка с VFX и постпродакшн", "Соединяем живую съёмку с графикой: режиссура VFX, трекинг, композитинг, cleanup, цвет и финальные мастер-файлы.", ["VFX-планирование до съёмки", "Супервайзинг и сбор материалов на площадке", "Композитинг, cleanup, цвет и контроль качества"], ["Можно подключить ФАЗУ только на постпродакшн?", "Да. Подключаемся к готовым материалам или усиливаем команду на отдельных этапах."], "VFX студия, композитинг видео, постпродакшн, графика в видео"),
        "en": ("VFX and post-production", "We combine live action and graphics through VFX direction, tracking, compositing, cleanup, grading and final delivery.", ["VFX planning before the shoot", "On-set supervision and data capture", "Compositing, cleanup, grade and quality control"], ["Can FAZA handle post-production only?", "Yes. We can work with existing footage or join a team for selected stages."], "VFX studio, video compositing, post-production company"),
        "zh": ("VFX 与后期制作", "将实拍与视觉图形结合，提供 VFX 设计、跟踪、合成、清理、调色与最终交付。", ["拍摄前的 VFX 规划", "现场视效监制与数据采集", "合成、清理、调色与质量控制"], ["可以只委托后期制作吗？", "可以。我们可以处理已有素材，也可以在指定阶段加入现有团队。"], "VFX工作室, 视频合成, 后期制作公司"),
    },
    "event-content": {
        "ru": ("Контент для форумов, выставок и медиафасадов", "Экранный контент для стендов, павильонов, сцен, арт-объектов и медиафасадов с учётом геометрии, разрешения и сценария показа.", ["Контент-концепция и техническая карта экранов", "3D, съёмка, монтаж и моушн-дизайн", "Тестовые рендеры и мастер-файлы под систему показа"], ["Работаете с нестандартными форматами экранов?", "Да. Перед производством фиксируем точные размеры, раскладку, кодек, частоту и безопасные зоны."], "контент для медиафасада, видео для выставочного стенда, экранный контент форума"),
        "en": ("Content for forums, exhibitions and media façades", "Screen content for booths, pavilions, stages, installations and media façades, designed around geometry, resolution and show flow.", ["Content concept and screen specification", "3D, live action, editing and motion design", "Test renders and masters for the playback system"], ["Do you support non-standard screen formats?", "Yes. We lock dimensions, layout, codec, frame rate and safe areas before production."], "exhibition screen content, media facade content, event motion design"),
        "zh": ("论坛、展览与媒体立面内容", "为展台、展馆、舞台、艺术装置与媒体立面制作屏幕内容，并适配几何结构、分辨率与播放流程。", ["内容概念与屏幕技术规格", "3D、实拍、剪辑与动态图形", "测试渲染及播放系统成片"], ["支持非标准屏幕格式吗？", "支持。制作前会确认尺寸、布局、编码、帧率与安全区域。"], "展览屏幕内容, 媒体立面视频, 活动视觉设计"),
    },
}

CASE_ITEMS = [
    ("faza-cg-demoreel-2025", "1144082517", {"ru":"FAZA CG demoreel 2025","en":"FAZA CG demoreel 2025","zh":"FAZA 2025 CG 作品集"}, "3d-motion"),
    ("farpost-stroika", "1181093198", {"ru":"Фарпост — Стройка","en":"FarPost — Construction","zh":"FarPost — 建设施工"}, "commercial"),
    ("minvostok-vef-2025", "1162416540", {"ru":"Минвосток — ВЭФ 2025","en":"Ministry for Far East — EEF 2025","zh":"俄罗斯远东发展部 — 2025 东方经济论坛"}, "event-content"),
    ("tsarskiy-pir-2025", "1155910589", {"ru":"Интерактивный ролик «Царский пир»","en":"The Tsar's Feast interactive film","zh":"《沙皇盛宴》互动影片"}, "event-content"),
    ("chudo-yudo-ryba-kit", "1155881774", {"ru":"Арт-объект «Чудо-юдо рыба-кит»","en":"Chudo-Yudo Whale installation","zh":"“奇迹鲸鱼”艺术装置"}, "event-content"),
    ("logistika-primorya", "1122106742", {"ru":"Логистика Приморского края","en":"Primorye logistics experience","zh":"滨海边疆区物流展示内容"}, "event-content"),
]

HOME = {
    "en": ("FAZA — video production, CG/3D and VFX", "Visual content that works for brands", "Commercials, corporate films, CG/3D, VFX and large-screen content — from concept to final master, across Russia and worldwide."),
    "zh": ("FAZA — 影视制作、CG/3D 与 VFX", "为品牌创造有效的视觉内容", "广告片、企业影片、CG/3D、VFX 与大型屏幕内容——从创意到最终成片，服务俄罗斯及全球客户。"),
}

def url(lang, path=""):
    prefix = LANGS[lang]["prefix"]
    return (prefix + ("/" + path.strip("/") if path else "") + "/") or "/"

def absolute(lang, path=""):
    return BASE + url(lang, path)

def alternates(path=""):
    return "\n".join([
        f'  <link rel="alternate" hreflang="ru" href="{absolute("ru", path)}">',
        f'  <link rel="alternate" hreflang="en" href="{absolute("en", path)}">',
        f'  <link rel="alternate" hreflang="zh-CN" href="{absolute("zh", path)}">',
        f'  <link rel="alternate" hreflang="x-default" href="{absolute("ru", path)}">',
    ])

def nav(lang):
    l = LANGS[lang]
    lang_links = "".join(f'<a href="{url(code)}"{" aria-current=\"page\"" if code == lang else ""}>{cfg["label"]}</a>' for code,cfg in LANGS.items())
    return f'''<header class="seo-nav">
  <a class="seo-logo" href="{url(lang)}">FAZA<span>.</span></a>
  <nav class="seo-menu" aria-label="Main navigation">
    <a href="{url(lang, "videoproduction")}">{l["services"]}</a>
    <a href="{url(lang, "cases")}">{l["works"]}</a>
    <a href="{url(lang, "prices")}">{l["prices"]}</a>
    <a href="{url(lang, "contacts")}">{l["contacts"]}</a>
  </nav>
  <div class="seo-lang" aria-label="Language">{lang_links}</div>
</header>'''

def schema(lang, title, description, canonical, kind="Service"):
    obj = {"@context":"https://schema.org","@type":kind,"name":title,"description":description,"url":canonical,"provider":{"@type":"Organization","name":"FAZA","url":BASE,"areaServed":["Russia","Worldwide"]}}
    return json.dumps(obj, ensure_ascii=False)

def page(lang, path, title, description, body, kind="Service", image="/assets/hero.webp"):
    canonical = absolute(lang, path)
    return f'''<!doctype html>
<html lang="{LANGS[lang]["html"]}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{escape(title)} — FAZA</title>
  <meta name="description" content="{escape(description, quote=True)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{canonical}">
{alternates(path)}
  <meta property="og:type" content="website">
  <meta property="og:title" content="{escape(title, quote=True)} — FAZA">
  <meta property="og:description" content="{escape(description, quote=True)}">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="{BASE}{image}">
  <meta property="og:locale" content="{"ru_RU" if lang=="ru" else "en_US" if lang=="en" else "zh_CN"}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/seo-pages.css?v=20261029-1">
  <script type="application/ld+json">{schema(lang,title,description,canonical,kind)}</script>
  <script src="/js/analytics.js?v=20261027-1" defer></script>
</head>
<body class="seo-page">
{nav(lang)}
{body}
<footer class="seo-footer"><div class="seo-shell seo-footer__row"><span>© 2026 FAZA</span><span>{LANGS[lang]["footer"]}</span><a href="mailto:project@fazafilms.ru">project@fazafilms.ru</a></div></footer>
</body>
</html>
'''

def cards(lang):
    out=[]
    for slug, ident, names, service in CASE_ITEMS:
        out.append(f'''<article class="seo-card"><a href="{url(lang, "cases/"+slug)}"><img src="/assets/posters/{ident}.webp" alt="{escape(names[lang], quote=True)}" width="480" height="270" loading="lazy"><div class="seo-card__body"><h3>{escape(names[lang])}</h3></div></a></article>''')
    return "\n".join(out)

def service_body(lang, slug, data):
    title, desc, inclusions, faq, _keywords = data
    l=LANGS[lang]
    steps = {
        "ru":["Бриф и задача","Концепция и смета","Производство","Постпродакшн и мастера"],
        "en":["Brief and objectives","Concept and estimate","Production","Post-production and delivery"],
        "zh":["需求与目标","创意与报价","制作执行","后期与交付"],
    }[lang]
    return f'''<main>
<section class="seo-hero"><div class="seo-shell"><span class="seo-kicker">FAZA · {l["services"]}</span><h1>{escape(title)}</h1><p class="seo-lead">{escape(desc)}</p><p>{escape(l["world"])}</p><div class="seo-actions"><a class="seo-btn" href="{url(lang,"contacts")}">{l["cta"]}</a><a class="seo-btn seo-btn--ghost" href="{url(lang,"cases")}">{l["more"]}</a></div></div></section>
<section class="seo-section"><div class="seo-shell"><h2>{l["offer"]}</h2><div class="seo-grid">{"".join(f'<article class="seo-card"><h3>{i+1:02}</h3><p>{escape(x)}</p></article>' for i,x in enumerate(inclusions))}</div></div></section>
<section class="seo-section"><div class="seo-shell"><h2>{l["process"]}</h2><ol class="seo-steps">{"".join(f'<li>{escape(x)}</li>' for x in steps)}</ol></div></section>
<section class="seo-section seo-cases"><div class="seo-shell"><h2>{l["works"]}</h2><div class="seo-grid">{cards(lang)}</div></div></section>
<section class="seo-section seo-faq"><div class="seo-shell"><h2>{l["faq"]}</h2><details open><summary>{escape(faq[0])}</summary><p>{escape(faq[1])}</p></details></div></section>
</main>'''

def write_page(lang, path, title, desc, body, kind="Service", image="/assets/hero.webp"):
    target = ROOT / LANGS[lang]["prefix"].strip("/") / path.strip("/") / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(page(lang,path,title,desc,body,kind,image),encoding="utf-8",newline="\n")

def generate():
    for lang in LANGS:
        if lang != "ru":
            title, h1, desc = HOME[lang]
            body=f'''<main><section class="seo-hero"><div class="seo-shell"><span class="seo-kicker">FAZA · video production</span><h1>{escape(h1)}</h1><p class="seo-lead">{escape(desc)}</p><div class="seo-actions"><a class="seo-btn" href="{url(lang,"contacts")}">{LANGS[lang]["cta"]}</a><a class="seo-btn seo-btn--ghost" href="{url(lang,"cases")}">{LANGS[lang]["more"]}</a></div></div></section><section class="seo-section"><div class="seo-shell"><h2>{LANGS[lang]["services"]}</h2><div class="seo-grid">{"".join(f'<article class="seo-card"><h3><a href="{url(lang,s)}">{escape(SERVICES[s][lang][0])}</a></h3><p>{escape(SERVICES[s][lang][1])}</p></article>' for s in SERVICES)}</div></div></section><section class="seo-section seo-cases"><div class="seo-shell"><h2>{LANGS[lang]["works"]}</h2><div class="seo-grid">{cards(lang)}</div></div></section></main>'''
            write_page(lang,"",title,desc,body,"Organization")
        for slug, translations in SERVICES.items():
            title,desc,*_=translations[lang]
            write_page(lang,slug,title,desc,service_body(lang,slug,translations[lang]))
        cases_desc={"ru":"Избранные проекты ФАЗЫ: рекламные ролики, CG/3D, VFX и экранный контент.","en":"Selected FAZA projects across commercials, CG/3D, VFX and screen content.","zh":"FAZA 精选项目：广告片、CG/3D、VFX 与屏幕内容。"}[lang]
        cases_body=f'''<main><section class="seo-hero"><div class="seo-shell"><span class="seo-kicker">Portfolio</span><h1>{LANGS[lang]["works"]}</h1><p class="seo-lead">{escape(cases_desc)}</p></div></section><section class="seo-section seo-cases"><div class="seo-shell"><div class="seo-grid">{cards(lang)}</div></div></section></main>'''
        write_page(lang,"cases",LANGS[lang]["works"],cases_desc,cases_body,"CollectionPage")
        for slug,ident,names,service in CASE_ITEMS:
            case_desc={"ru":f"Кейс студии ФАЗА: {names[lang]}. Видео, состав работ и связанное направление производства.","en":f"FAZA case study: {names[lang]}. Video, production scope and related service.","zh":f"FAZA 项目案例：{names[lang]}。视频、制作范围与相关服务。"}[lang]
            watch={"ru":"Смотреть полное видео на Vimeo","en":"Watch the full video on Vimeo","zh":"在 Vimeo 观看完整视频"}[lang]
            scope={"ru":"Страница фиксирует опубликованный проект и направление работ. Измеримые бизнес-результаты не заявляются без подтверждения заказчика.","en":"This page documents the published work and production discipline. Business results are not claimed without client confirmation.","zh":"本页展示已发布作品与制作方向；未经客户确认，不宣称具体商业成果。"}[lang]
            body=f'''<main><section class="seo-hero"><div class="seo-shell"><span class="seo-kicker">FAZA · {LANGS[lang]["works"]}</span><h1>{escape(names[lang])}</h1><p class="seo-lead">{escape(case_desc)}</p></div></section><section class="seo-section"><div class="seo-shell seo-media"><div><img src="/assets/posters/{ident}.webp" alt="{escape(names[lang],quote=True)}" width="1280" height="720"></div><div><h2>{escape(SERVICES[service][lang][0])}</h2><p>{escape(scope)}</p><div class="seo-actions"><a class="seo-btn" href="https://vimeo.com/{ident}" target="_blank" rel="noopener">{watch}</a><a class="seo-btn seo-btn--ghost" href="{url(lang,service)}">{LANGS[lang]["services"]}</a></div></div></div></section></main>'''
            write_page(lang,"cases/"+slug,names[lang],case_desc,body,"VideoObject",f"/assets/posters/{ident}.webp")
        price_title={"ru":"Стоимость видеопроизводства","en":"Video production pricing","zh":"影视制作费用"}[lang]
        price_desc={"ru":"Форматы сотрудничества ФАЗЫ: пакет, проект под ключ или ежемесячный ретейнер. Точная смета после брифа.","en":"FAZA engagement models: packaged scope, turnkey production or monthly retainer. A detailed estimate follows the brief.","zh":"FAZA 合作模式：标准服务包、全案制作或月度合作。详细报价在需求沟通后提供。"}[lang]
        labels={"ru":["Пакет под задачу","Проект под ключ","Ретейнер"],"en":["Packaged scope","Turnkey project","Monthly retainer"],"zh":["标准服务包","全案制作","月度合作"]}[lang]
        price_body=f'''<main><section class="seo-hero"><div class="seo-shell"><span class="seo-kicker">Pricing</span><h1>{price_title}</h1><p class="seo-lead">{price_desc}</p><a class="seo-btn" href="{url(lang,"contacts")}">{LANGS[lang]["cta"]}</a></div></section><section class="seo-section"><div class="seo-shell"><div class="seo-grid">{"".join(f'<article class="seo-card"><h3>{escape(x)}</h3><p>{escape(price_desc)}</p></article>' for x in labels)}</div></div></section></main>'''
        write_page(lang,"prices",price_title,price_desc,price_body,"WebPage")
        contact_title={"ru":"Обсудить видеопроект","en":"Start a video project","zh":"咨询影视项目"}[lang]
        contact_desc={"ru":"Опишите задачу ФАЗЕ. Ответим в течение рабочего дня и предложим следующий шаг, сроки и ориентир бюджета.","en":"Tell FAZA about your project. We will respond within one business day with the next step, timing and a budget framework.","zh":"向 FAZA 介绍您的项目。我们将在一个工作日内回复，并说明下一步、周期与预算范围。"}[lang]
        contact_body=f'''<main><section class="seo-hero"><div class="seo-shell"><span class="seo-kicker">Contact</span><h1>{contact_title}</h1><p class="seo-lead">{contact_desc}</p><div class="seo-actions"><a class="seo-btn" href="mailto:project@fazafilms.ru">project@fazafilms.ru</a><a class="seo-btn seo-btn--ghost" href="tel:+79247319101">+7 924 731 91 01</a></div><p>{escape(LANGS[lang]["world"])}</p></div></section></main>'''
        write_page(lang,"contacts",contact_title,contact_desc,contact_body,"ContactPage")

    paths=["/"]+[url(lang) for lang in ("en","zh")]
    for lang in LANGS:
        paths += [url(lang,s) for s in SERVICES]
        paths += [url(lang,"cases"),url(lang,"prices"),url(lang,"contacts")]
        paths += [url(lang,"cases/"+slug) for slug,*_ in CASE_ITEMS]
    paths=list(dict.fromkeys(paths))
    sitemap=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for p in paths:
        logical=p
        if p.startswith("/en/"): logical=p[3:]
        elif p=="/en/": logical="/"
        elif p.startswith("/zh/"): logical=p[3:]
        elif p=="/zh/": logical="/"
        sitemap.append(f'  <url><loc>{BASE}{p}</loc><lastmod>{UPDATED}</lastmod><xhtml:link rel="alternate" hreflang="ru" href="{BASE}{url("ru",logical)}"/><xhtml:link rel="alternate" hreflang="en" href="{BASE}{url("en",logical)}"/><xhtml:link rel="alternate" hreflang="zh-CN" href="{BASE}{url("zh",logical)}"/><xhtml:link rel="alternate" hreflang="x-default" href="{BASE}{url("ru",logical)}"/></url>')
    sitemap.append('</urlset>')
    (ROOT/"sitemap.xml").write_text("\n".join(sitemap)+"\n",encoding="utf-8",newline="\n")

if __name__ == "__main__":
    generate()
