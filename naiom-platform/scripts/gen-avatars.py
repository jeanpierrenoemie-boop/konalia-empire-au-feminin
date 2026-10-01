import math, os, sys

def shade(hexc, f):
    h=hexc.lstrip("#"); r,g,b=[int(h[i:i+2],16) for i in (0,2,4)]
    if f>=0: r,g,b=[int(c+(255-c)*f) for c in (r,g,b)]
    else: r,g,b=[int(c*(1+f)) for c in (r,g,b)]
    return "#%02x%02x%02x"%(r,g,b)

GOLD="#D4AF37"

def hair_back(style, hc):
    s=[]
    if style=="puff":
        s.append(f'<circle cx="128" cy="62" r="54" fill="{hc}"/>')
        for a in range(200,341,14):
            x=128+56*math.cos(math.radians(a)); y=66+52*math.sin(math.radians(a))
            s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="12" fill="{hc}"/>')
    elif style=="curls":
        s.append(f'<ellipse cx="128" cy="96" rx="76" ry="80" fill="{hc}"/>')
        for a in range(150,391,15):
            x=128+78*math.cos(math.radians(a)); y=100+80*math.sin(math.radians(a))
            s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="13" fill="{hc}"/>')
    elif style=="bun":
        s.append(f'<circle cx="128" cy="40" r="25" fill="{hc}"/>')
        for k in range(8):
            a=k*45; x=128+22*math.cos(math.radians(a)); y=40+22*math.sin(math.radians(a))
            s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="{shade(hc,0.08)}"/>')
        s.append(f'<ellipse cx="128" cy="86" rx="52" ry="40" fill="{hc}"/>')
    elif style=="wavy":
        s.append(f'<path d="M72,100 C60,150 66,206 52,246 L204,246 C190,206 196,150 184,100 C180,62 76,62 72,100Z" fill="{hc}"/>')
    elif style=="braids":
        s.append(f'<ellipse cx="128" cy="84" rx="52" ry="40" fill="{hc}"/>')
    elif style=="locs":
        s.append(f'<ellipse cx="128" cy="86" rx="56" ry="44" fill="{hc}"/>')
    elif style=="wrap":
        pass
    return "".join(s)

def hair_front(style, hc, male=False):
    s=[]
    cap=f'<path d="M80,108 C62,30 194,30 176,108 C168,86 150,74 128,74 C106,74 88,86 80,108Z" fill="{hc}"/><path d="M96,56 C116,42 150,44 164,60" stroke="{shade(hc,0.22)}" stroke-width="3" fill="none" opacity="0.5" stroke-linecap="round"/>'
    if style in("puff","curls","bun","braids","locs"):
        s.append(cap)
    if style=="wavy":
        s.append(f'<path d="M82,108 C66,36 190,36 174,108 C160,86 140,70 118,76 C104,84 92,94 82,108Z" fill="{hc}"/>')
    if style=="fade":
        s.append(f'<path d="M84,104 C78,44 178,44 172,104 C166,88 152,78 128,78 C104,78 90,88 84,104Z" fill="{hc}"/><path d="M100,56 C118,48 146,48 158,58" stroke="{shade(hc,0.22)}" stroke-width="3" fill="none" opacity="0.5" stroke-linecap="round"/>')
    if style=="fadeflat":
        s.append(f'<path d="M86,98 C86,56 170,56 170,98 C164,84 150,76 128,76 C106,76 92,84 86,98Z" fill="{hc}"/>')
    return "".join(s)

def braids_over(hc, n=6):
    s=[]
    hi=shade(hc,0.18)
    for side in (-1,1):
        for k in range(n):
            x0=128+side*(40+k*3.2); y0=84+k*3
            x1=128+side*(70+k*5.5); y1=236+k*2
            c1=128+side*(78+k*1.5)
            d=f"M{x0:.1f},{y0} C{c1:.1f},{y0+40} {x1+side*2:.1f},{y1-70} {x1:.1f},{y1}"
            s.append(f'<path d="{d}" stroke="{hc}" stroke-width="8" fill="none" stroke-linecap="round"/>')
            s.append(f'<path d="{d}" stroke="{hi}" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="5 6"/>')
            s.append(f'<circle cx="{x1:.1f}" cy="{y1:.1f}" r="3.2" fill="{GOLD}"/>')
    return "".join(s)

def locs_over(hc):
    s=[]
    hi=shade(hc,0.15)
    for side in (-1,1):
        for k in range(6):
            x0=128+side*(38+k*4); y0=82+k*2
            x1=128+side*(66+k*6); y1=228+k*3
            d=f"M{x0:.1f},{y0} C{x0+side*18:.1f},{y0+50} {x1-side*14:.1f},{y1-60} {x1:.1f},{y1}"
            s.append(f'<path d="{d}" stroke="{hc}" stroke-width="10" fill="none" stroke-linecap="round"/>')
            s.append(f'<path d="{d}" stroke="{hi}" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="3 7"/>')
    return "".join(s)

def headwrap(c1, c2):
    return (f'<path d="M80,96 C78,52 178,52 176,96 C160,78 96,78 80,96Z" fill="{c1}"/>'
            f'<path d="M84,86 C100,70 156,70 172,86" stroke="{c2}" stroke-width="5" fill="none"/>'
            f'<path d="M88,74 C106,60 150,60 168,74" stroke="{c2}" stroke-width="4" fill="none" stroke-dasharray="3 5"/>'
            f'<path d="M150,58 C176,38 204,50 190,76 C186,60 168,56 150,58Z" fill="{c1}"/>'
            f'<path d="M150,58 C170,66 176,80 170,92" stroke="{c2}" stroke-width="3" fill="none"/>')

def avatar(a):
    sk=a["skin"]; skd=shade(sk,-0.18); skl=shade(sk,0.12)
    hc=a.get("hair","#140c08"); out=a["outfit"]; outd=shade(out,-0.25); inner=a.get("inner","#101010")
    male=a.get("male",False); style=a["style"]
    lip=a.get("lip", "#7a2f2f" if not male else shade(sk,-0.3))
    acc=a["accent"]
    S=[]
    S.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">')
    S.append(f'<defs><radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="{shade(acc,-0.45)}"/><stop offset="1" stop-color="#06120e"/></radialGradient>'
             f'<clipPath id="c"><circle cx="128" cy="128" r="124"/></clipPath>'
             f'<linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{skl}"/><stop offset="1" stop-color="{sk}"/></linearGradient></defs>')
    S.append('<g clip-path="url(#c)">')
    S.append('<rect width="256" height="256" fill="url(#bg)"/>')
    S.append(f'<circle cx="128" cy="150" r="96" fill="{acc}" opacity="0.10"/>')
    S.append('<g transform="translate(128 156) scale(1.22) translate(-128 -156)">')
    S.append(hair_back(style,hc))
    # cou + torse
    S.append(f'<path d="M24,262 C24,214 66,196 108,192 L148,192 C190,196 232,214 232,262Z" fill="{out}"/>')
    S.append(f'<path d="M108,192 L96,262 L24,262 C24,214 66,196 108,192Z" fill="{outd}" opacity="0.35"/>')
    S.append(f'<rect x="107" y="146" width="42" height="58" rx="14" fill="{skd}"/>')
    kind=a.get("neck","v")
    if kind=="v":
        S.append(f'<path d="M106,192 L128,232 L150,192Z" fill="{inner}"/>')
        S.append(f'<path d="M106,192 L128,226 L121,192Z M150,192 L128,226 L135,192Z" fill="{skd}" opacity="0"/>')
        S.append(f'<path d="M100,190 L128,240 L112,190Z" fill="{outd}"/><path d="M156,190 L128,240 L144,190Z" fill="{outd}"/>')
    elif kind=="turtle":
        S.append(f'<rect x="104" y="170" width="48" height="32" rx="12" fill="{inner}"/>')
    elif kind=="round":
        S.append(f'<path d="M104,192 C112,214 144,214 152,192Z" fill="{skd}"/>')
        S.append(f'<path d="M104,192 C112,214 144,214 152,192" stroke="{outd}" stroke-width="3" fill="none"/>')
    elif kind=="tie":
        S.append(f'<path d="M106,192 L128,214 L150,192 L150,200 L128,222 L106,200Z" fill="#f3efe6"/>')
        S.append(f'<path d="M122,214 L134,214 L138,262 L128,270 L118,262Z" fill="{a.get("tie","#7a1f2b")}"/>')
        S.append(f'<path d="M100,190 L128,236 L112,190Z" fill="{outd}"/><path d="M156,190 L128,236 L144,190Z" fill="{outd}"/>')
    # tête
    if male:
        head="M128,60 C100,60 84,80 84,110 C84,142 96,168 128,174 C160,168 172,142 172,110 C172,80 156,60 128,60Z"
    else:
        head="M128,58 C98,58 82,82 82,112 C82,140 98,166 128,172 C158,166 174,140 174,112 C174,82 158,58 128,58Z"
    # oreilles
    S.append(f'<ellipse cx="82" cy="118" rx="8" ry="13" fill="{sk}"/><ellipse cx="174" cy="118" rx="8" ry="13" fill="{sk}"/>')
    S.append(f'<path d="{head}" fill="url(#sg)"/>')
    S.append(f'<path d="M128,150 C108,152 96,142 92,128 C96,156 110,172 128,174 C146,172 160,156 164,128 C160,142 148,152 128,150Z" fill="{skd}" opacity="0.35"/>')
    # barbe
    if a.get("beard"):
        S.append(f'<path d="M84,118 C84,160 104,180 128,180 C152,180 172,160 172,118 C166,144 152,154 128,154 C104,154 90,144 84,118Z" fill="{hc}"/>')
        S.append(f'<path d="M110,156 C118,150 138,150 146,156 C140,160 116,160 110,156Z" fill="{hc}"/>')
    # cheveux avant (derrière lunettes)
    S.append(hair_front(style,hc,male))
    if style=="wrap": S.append(headwrap(a["wrap1"],a["wrap2"]))
    # yeux
    for ex in (108,148):
        S.append(f'<ellipse cx="{ex}" cy="116" rx="9" ry="5" fill="#f5f0e8"/>')
        S.append(f'<circle cx="{ex}" cy="116.5" r="4.2" fill="#2a170f"/><circle cx="{ex+1.5}" cy="115" r="1.3" fill="#fff"/>')
        S.append(f'<path d="M{ex-10},116 C{ex-4},108 {ex+4},108 {ex+10},116" stroke="#120a06" stroke-width="2.4" fill="none" stroke-linecap="round"/>')
    bw=3.0 if male else 2.0
    S.append(f'<path d="M96,100 C104,94 114,94 120,98" stroke="{hc}" stroke-width="{bw}" fill="none" stroke-linecap="round"/>')
    S.append(f'<path d="M136,98 C142,94 152,94 160,100" stroke="{hc}" stroke-width="{bw}" fill="none" stroke-linecap="round"/>')
    # nez
    S.append(f'<path d="M128,118 C125,130 120,138 122,142 C126,146 130,146 134,142 C136,138 131,130 128,118Z" fill="{skd}" opacity="0.45"/>')
    S.append(f'<ellipse cx="124.5" cy="142" rx="2.4" ry="1.6" fill="{shade(sk,-0.45)}" opacity="0.7"/><ellipse cx="131.5" cy="142" rx="2.4" ry="1.6" fill="{shade(sk,-0.45)}" opacity="0.7"/>')
    # bouche
    if male:
        S.append(f'<path d="M112,156 C120,160 136,160 144,156 C138,166 118,166 112,156Z" fill="{lip}"/>')
        S.append(f'<path d="M112,156 C120,153 136,153 144,156" stroke="{shade(lip,-0.3)}" stroke-width="1.6" fill="none"/>')
    else:
        S.append(f'<path d="M108,155 C116,148 124,150 128,152 C132,150 140,148 148,155 C140,166 116,166 108,155Z" fill="{lip}"/>')
        S.append(f'<path d="M110,155 C120,159 136,159 146,155" stroke="{shade(lip,-0.35)}" stroke-width="1.4" fill="none"/>')
        S.append(f'<path d="M116,158 C124,161 132,161 140,158" stroke="#fff" stroke-width="1.6" fill="none" opacity="0.35" stroke-linecap="round"/>')
        S.append(f'<ellipse cx="100" cy="138" rx="10" ry="6" fill="#e0603a" opacity="0.14"/><ellipse cx="156" cy="138" rx="10" ry="6" fill="#e0603a" opacity="0.14"/>')
    # cheveux par-dessus
    if style=="braids": S.append(braids_over(hc))
    if style=="locs": S.append(locs_over(hc))
    # bijoux
    if a.get("hoops"):
        S.append(f'<circle cx="80" cy="140" r="11" fill="none" stroke="{GOLD}" stroke-width="3.2"/><circle cx="176" cy="140" r="11" fill="none" stroke="{GOLD}" stroke-width="3.2"/>')
    if a.get("chain"):
        S.append(f'<path d="M104,196 C112,224 144,224 152,196" stroke="{GOLD}" stroke-width="2.4" fill="none"/><circle cx="128" cy="220" r="4" fill="{GOLD}"/>')
    if a.get("glasses"):
        gc=a.get("gcol","#1a1a1a")
        S.append(f'<circle cx="108" cy="116" r="16" fill="#9ad7ff" opacity="0.10" stroke="{gc}" stroke-width="3"/><circle cx="148" cy="116" r="16" fill="#9ad7ff" opacity="0.10" stroke="{gc}" stroke-width="3"/><path d="M124,116 L132,116" stroke="{gc}" stroke-width="3"/><path d="M92,114 L82,110 M164,114 L174,110" stroke="{gc}" stroke-width="3"/>')
    if a.get("headset"):
        S.append(f'<path d="M80,104 C78,40 178,40 176,104" stroke="#222" stroke-width="6" fill="none"/><rect x="72" y="100" width="14" height="30" rx="6" fill="#222"/><rect x="170" y="100" width="14" height="30" rx="6" fill="#222"/><path d="M78,128 C80,152 100,162 116,160" stroke="#222" stroke-width="4" fill="none"/><circle cx="118" cy="160" r="5" fill="#222"/>')
    S.append('</g></g>')
    S.append(f'<circle cx="128" cy="128" r="122" fill="none" stroke="{GOLD}" stroke-width="5"/>')
    S.append('</svg>')
    return "".join(S)

SK=["#3b2417","#4a2c1c","#5a3722","#6a4229","#7a4d30","#8a5a38"]
AGENTS={
 "orchestrateur":dict(name="Kélan",role="Orchestrateur",skin=SK[1],male=True,style="fade",beard=True,outfit="#14532d",inner="#0b0b0b",neck="v",accent="#22c55e"),
 "strategiste":dict(name="Amara",role="Stratège",skin=SK[2],style="braids",outfit="#5b3a2e",inner="#1b1b1b",neck="v",hoops=True,lip="#8a3a2e",accent="#b45309"),
 "analyste":dict(name="Malik",role="Analyste",skin=SK[3],male=True,style="fade",beard=True,outfit="#c9ad8a",inner="#101010",neck="turtle",accent="#38bdf8"),
 "designer":dict(name="Zayna",role="Designer",skin=SK[2],style="curls",outfit="#2a1a10",inner="#101010",neck="round",hoops=True,lip="#a4474a",chain=True,accent="#f59e0b"),
 "createur-contenu":dict(name="Aïna",role="Créatrice de contenu",skin=SK[3],style="bun",outfit="#e8741a",inner="#141414",neck="round",hoops=True,lip="#b3443e",accent="#fb923c"),
 "presentateur":dict(name="Imani",role="Présentatrice",skin=SK[1],style="braids",outfit="#7a4a2b",inner="#f3e9dc",neck="v",hoops=True,lip="#9a3b3b",accent="#d97706"),
 "prospection":dict(name="Sékou",role="Prospection",skin=SK[4],male=True,style="fade",outfit="#c8b59a",inner="#f3efe6",neck="tie",tie="#7a1f2b",accent="#3b82f6"),
 "veille":dict(name="Nali",role="Veille",skin=SK[3],style="wavy",outfit="#1f6f4a",inner="#101010",neck="v",hoops=True,lip="#8f3b45",accent="#10b981"),
 "cerveau":dict(name="Kéïta",role="Cerveau",skin=SK[1],male=True,style="fade",beard=True,glasses=True,outfit="#1e293b",inner="#0f172a",neck="v",accent="#a78bfa"),
 "gmail":dict(name="Lina",role="Communications",skin=SK[4],style="curls",outfit="#d8c3a5",inner="#1a1a1a",neck="v",hoops=True,lip="#a24a50",accent="#f59e0b"),
 "fireflies":dict(name="Sira",role="Mémoire",skin=SK[2],style="wavy",outfit="#7b3f26",inner="#141414",neck="v",lip="#8a3a32",chain=True,accent="#c084fc"),
 "proposition":dict(name="Idriss",role="Offres & propositions",skin=SK[5],male=True,style="fade",outfit="#111827",inner="#f3efe6",neck="tie",tie="#1d4ed8",accent="#10b981"),
 "comptabilite":dict(name="Chloé",role="Compta",skin=SK[4],style="puff",outfit="#1e3a5f",inner="#f3efe6",neck="v",hoops=True,lip="#9a4044",accent="#60a5fa"),
 "cv":dict(name="Clara",role="Recrutement",skin=SK[3],style="wrap",wrap1="#1f7a4d",wrap2="#d4af37",outfit="#0f4c3a",inner="#f3efe6",neck="round",hoops=True,lip="#9d3a40",accent="#34d399"),
 "ecommerce":dict(name="Emma",role="E-commerce",skin=SK[5],style="locs",outfit="#e0675a",inner="#fff4ea",neck="v",hoops=True,lip="#b04c4c",accent="#f43f5e"),
}
if __name__=="__main__":
    out=sys.argv[1]; os.makedirs(out,exist_ok=True)
    for slug,a in AGENTS.items():
        open(os.path.join(out,slug+".svg"),"w",encoding="utf8").write(avatar(a))
    cards="".join(f'<div class="c"><img src="{s}.svg"><b>{a["name"]}</b><i>{a["role"]}</i></div>' for s,a in AGENTS.items())
    open(os.path.join(out,"sheet.html"),"w",encoding="utf8").write(f'<html><body style="margin:0;background:#0b1511;font-family:sans-serif"><style>.g{{display:grid;grid-template-columns:repeat(5,200px);gap:14px;padding:18px;justify-content:center}}.c{{text-align:center;color:#f3e7c0}}.c img{{width:190px;height:190px}}.c b{{display:block;margin-top:4px}}.c i{{font-size:12px;color:#b8a56a}}</style><div class="g">{cards}</div></body></html>')
    print("ok",len(AGENTS))
