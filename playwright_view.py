#!/usr/bin/env python3
# guns.lol REAL view worker v2 — headed Chromium (xvfb) + stealth + prova de analytics
# v1 falhou: headless puro nao passa o Turnstile -> analytics nunca dispara.
# Aqui: navegador COM tela virtual, fingerprint stealth, e confirma vendo o
# request de analytics (/api/analytics/view ou gif) sair na rede. Sem request = sem view.
import os, sys, time, random, itertools

USER = os.environ.get("GUNS_USER", "").strip().replace("@", "")
MINUTES = float(os.environ.get("GUNS_MINUTES", "30"))

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
    try:
        from playwright_stealth import stealth_sync
        stealth = "sync"
    except Exception:
        stealth = None
    if not USER:
        sys.exit("GUNS_USER vazio")
    proxies = load_proxies()
    if not proxies:
        sys.exit("PROXY_LIST vazio")
    print(f"[+] alvo: https://guns.lol/{USER} | proxies: {len(proxies)} | stealth={'on' if stealth else 'off'} | {MINUTES}min", flush=True)
    pool = itertools.cycle(proxies)
    deadline = time.time() + MINUTES * 60
    n = 0
    counted = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, args=["--no-sandbox", "--disable-blink-features=AutomationControlled", "--window-size=1366,768"])
        while time.time() < deadline:
            px = next(pool)
            n += 1
            fired = []
            try:
                ctx = browser.new_context(
                    proxy=px, user_agent=random.choice(UAS),
                    viewport={"width": 1366, "height": 768},
                    locale="en-US", timezone_id="America/Sao_Paulo",
                )
                pg = ctx.new_page()
                if stealth:
                    try:
                        stealth_sync(pg)
                    except Exception as e:
                        print(f"[{n}] stealth warn: {str(e)[:60]}", flush=True)
                # prova: escuta o analytics de verdade
                pg.on("request", lambda r: fired.append(r.url) if ("analytics" in r.url or "simple-analytics" in r.url) else None)
                pg.on("response", lambda r: fired.append("R:" + r.url) if ("analytics" in r.url) else None)
                pg.goto(f"https://guns.lol/{USER}?v={n:x}", wait_until="domcontentloaded", timeout=60000)
                pg.wait_for_timeout(3000)
                # splash click (humano)
                try:
                    pg.mouse.move(683, 300)
                    pg.mouse.click(683, 384)
                except Exception:
                    pass
                pg.wait_for_timeout(12000 + random.randint(0, 6000))
                try:
                    pg.mouse.wheel(0, 300)
                    pg.wait_for_timeout(3000)
                except Exception:
                    pass
                hits = [u for u in fired if u.startswith("http")]
                if hits:
                    counted += 1
                    print(f"[{n}] ANALYTICS ✅ {hits[0][:80]}", flush=True)
                else:
                    print(f"[{n}] sem analytics (bloqueado?) titulo={pg.title()[:40]!r}", flush=True)
                ctx.close()
            except Exception as e:
                print(f"[{n}] fail: {str(e)[:90]}", flush=True)
            time.sleep(random.uniform(2.0, 5.0))
        browser.close()
    print(f"[!] fim: {counted}/{n} com analytics disparado", flush=True)

main()
