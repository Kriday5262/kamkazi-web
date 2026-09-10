
import time
from playwright.sync_api import sync_playwright
cookie = open("/tmp/cookie.txt").read().strip()
with sync_playwright() as p:
    b = p.chromium.launch(args=["--ignore-certificate-errors"])
    ctx = b.new_context(ignore_https_errors=True)
    page = ctx.new_page()
    ctx.add_cookies([{"name":"kamkazi_session","value":cookie,"domain":"127.0.0.1","path":"/"}])
    page.goto("http://127.0.0.1:8812/settings", wait_until="networkidle")
    page.get_by_role("button", name="Calendar").first.click()
    page.wait_for_selector("text=Connect another Google account", timeout=15000)
    print("cards:", page.get_by_text("Google Calendar", exact=True).count())
    email_el = page.get_by_text("mock.personal@gmail.com").first
    card = email_el.locator("xpath=ancestor::div[contains(@class,'border-b') or contains(@class,'py-3')][1]")
    btn = card.get_by_role("button", name="Disconnect")
    print("btn count:", btn.count())
    btn.first.click()
    time.sleep(3)
    body = page.inner_text("body")
    print("mock.personal still visible:", "mock.personal@gmail.com" in body)
    print("real account still visible:", "NStarX Inc." in body)
    print("connect-another still present:", page.get_by_text("Connect another Google account").count() > 0)
    page.screenshot(path="/tmp/settings_multacc_after.png")
    b.close()
print("PLAYWRIGHT-DONE")
