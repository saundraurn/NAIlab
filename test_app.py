import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        errors = []
        page.on("pageerror", lambda err: errors.append(err))
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

        print("Loading index.html...")
        import os
        filepath = "file://" + os.path.abspath("index.html")
        await page.goto(filepath)

        # Give it a second to load
        await page.wait_for_timeout(2000)

        if errors:
            print("Errors found:")
            for e in errors:
                print(e)
            exit(1)
        else:
            print("No errors on load.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
