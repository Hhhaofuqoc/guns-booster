#!/usr/bin/env python3
# guns.lol REAL view worker (Playwright + Chromium real + proxies residenciais)
# Por que browser real e nao curl: o guns conta view via POST /api/analytics/view
# protegido por Cloudflare Turnstile + PoW em WASM. GET simples (curl) nunca conta.
# Chromium legitimo + IP residencial costuma passar o Turnstile sozinho e o JS
# da pagina resolve o PoW e dispara o analytics -> view conta de verdade.
# Limite real: ~1 view/IP/dia -> 200 proxies ~= 200 views/dia. Velocidade nao
# adianta além disso (views rápidas demais são removidas).
import os, sys, time, random, itertools

USER = os.environ.get("GUNS_USER", "").strip().replace("@", "")
MINUTES = float(os.environ.get("GUNS_MINUTES", "30"))
CONC = int(os.environ.get("GUNS_CONC", "3"))

UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
]

def load_proxies():
    env = os.environ.get("PROXY_LIST", "").strip()
    lines = [l.strip() for l in env.replace("\r", "\n").split("\n")] if env else []
    out = []
    for line in lines:
        if not line or line.startswith("#"):
            continue
        p = line.split(":")
        if len(p) >= 4:
            out.append({"server": f"http://{p[0]}:{p[1]}",
                        "username": p[2], "password": ":".join(p[3:])})
        elif len(p) == 2:
            out.append({"server": f"http://{p[0]}:{p[1]}"})
    return out

def main():
    from playwright.sync_api import sync_playwright
    if not USER:
        sys.exit("GUNS_USER vazio")
    proxies = load_proxies()
    if not proxies:
        sys.exit("PROXY_LIST vazio")
    print(f"[+] alvo: https://guns.lol/{USER} | proxies: {len(proxies)} | workers: {CONC} | {MINUTES}min", flush=True)
    pool = itertools.cycle(proxies)
    deadline = time.time() + MINUTES * 60
    n = 0
    ok = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
        while time.time() < deadline:
            px = next(pool)
            n += 1
            try:
                ctx = browser.new_context(
                    proxy=px, user_agent=random.choice(UAS),
                    viewport={"width": 1366, "height": 768},
                    locale="en-US", timezone_id="America/Sao_Paulo",
                )
                # alivia: bloqueia midia/fontes (conta view do mesmo jeito)
                ctx.route("**/*.{mp4,webm,mp3,wav,ogg,woff,woff2}", lambda r: r.abort())
                pg = ctx.new_page()
                pg.goto(f"https://guns.lol/{USER}?v={n:x}", wait_until="domcontentloaded", timeout=45000)
                pg.wait_for_timeout(9000 + random.randint(0, 5000))  # deixa Turnstile+PoW+analytics rodarem
                # scroll/click humano bobo
                try:
                    pg.mouse.move(400 + random.randint(0, 300), 300 + random.randint(0, 200))
                    pg.mouse.wheel(0, 200)
                except Exception:
                    pass
                pg.wait_for_timeout(3000)
                ok += 1
                print(f"[{n}] view ok ({px['server'].split('@')[-1][:21]})", flush=True)
                ctx.close()
            except Exception as e:
                print(f"[{n}] fail: {str(e)[:90]}", flush=True)
            time.sleep(random.uniform(1.0, 3.0))
        browser.close()
    print(f"[!] fim: {ok}/{n} views enviadas", flush=True)

main()
