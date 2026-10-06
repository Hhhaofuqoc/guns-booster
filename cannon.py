#!/usr/bin/env python3
# guns.lol view-cannon — 5 views/seg via 200 proxies residenciais (round-robin + retry)
# uso: python3 cannon.py <guns-user> [rps]   (ex: python3 cannon.py koppy 5)
import sys, time, random, itertools, threading, os
from concurrent.futures import ThreadPoolExecutor
import requests

USER = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("GUNS_USER", "")).strip().replace("@", "")
RPS = float(sys.argv[2]) if len(sys.argv) > 2 else float(os.environ.get("GUNS_RPS", "5"))
RUN_MIN = float(os.environ.get("GUNS_MINUTES", "0"))  # 0 = infinito (até cancelar)
PROXY_FILE = os.environ.get("PROXY_FILE", "/sdcard/Download/Residencial Proxys/proxies_simple.txt")  # ip:port:user:pass

UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6099.43 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
]

def load_proxies():
    # 1) secret/variável de ambiente (GitHub Actions — nunca commita proxy no repo)
    env = os.environ.get("PROXY_LIST", "").strip()
    if env:
        lines = [l.strip() for l in env.replace("\r", "\n").split("\n")]
    else:
        with open(PROXY_FILE, encoding="utf-8", errors="ignore") as f:
            lines = [l.strip() for l in f]
    out = []
    for line in lines:
        if not line or line.startswith("#"):
            continue
        p = line.split(":")
        if len(p) >= 4:
            ip, port, user, pwd = p[0], p[1], p[2], ":".join(p[3:])
            out.append(f"http://{user}:{pwd}@{ip}:{port}")
        elif len(p) == 2:
            out.append(f"http://{p[0]}:{p[1]}")
    return out

PROXIES = load_proxies()
if not USER:
    sys.exit("uso: python3 cannon.py <guns-user> [views-por-seg]")
if not PROXIES:
    sys.exit("sem proxies em " + PROXY_FILE)
print(f"[+] alvo: https://guns.lol/{USER} | proxies: {len(PROXIES)} | meta: {RPS}/s")

pool = itertools.cycle(PROXIES)
lock = threading.Lock()
stats = {"ok": 0, "fail": 0}
stop = False

def hit(n):
    url = f"https://guns.lol/{USER}?v={n:x}{random.randint(1000,9999)}"
    px = next(pool)
    try:
        r = requests.get(url, proxies={"http": px, "https": px},
                         headers={"User-Agent": random.choice(UAS),
                                  "Accept": "text/html,application/xhtml+xml",
                                  "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
                                  "Referer": "https://www.google.com/"},
                         timeout=15, allow_redirects=True)
        good = r.status_code in (200, 304)
    except Exception:
        good = False
        # 1 retry em outro proxy
        try:
            px2 = next(pool)
            r = requests.get(url, proxies={"http": px2, "https": px2},
                             headers={"User-Agent": random.choice(UAS)}, timeout=15)
            good = r.status_code in (200, 304)
        except Exception:
            good = False
    with lock:
        stats["ok" if good else "fail"] += 1

def monitor(t0):
    while not stop:
        time.sleep(5)
        el = time.time() - t0
        with lock:
            ok, fail = stats["ok"], stats["fail"]
        tot = ok + fail
        print(f"[{int(el)}s] ok={ok} fail={fail} rps={tot/max(el,1):.1f}", flush=True)

t0 = time.time()
deadline = (t0 + RUN_MIN * 60) if RUN_MIN > 0 else None
threading.Thread(target=monitor, args=(t0,), daemon=True).start()
gap = 1.0 / RPS
i = 0
try:
    with ThreadPoolExecutor(max_workers=20) as ex:
        while True:
            if deadline and time.time() >= deadline:
                break
            ex.submit(hit, i)
            i += 1
            time.sleep(gap * random.uniform(0.85, 1.15))  # jitter p/ não parecer robô
except KeyboardInterrupt:
    pass
finally:
    stop = True
    el = time.time() - t0
    print(f"[!] fim: ok={stats['ok']} fail={stats['fail']} em {int(el)}s ({stats['ok']/max(el,1):.1f}/s)")
