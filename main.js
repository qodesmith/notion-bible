import puppeteer from 'puppeteer'

const browser = await puppeteer.launch({headless: false})
const page = await browser.newPage()

await page.goto(
  'https://www.biblegateway.com/versions/English-Standard-Version-ESV-Bible#booklist'
)

const otBooks = await page.$$('.ot-book')

for (let i = 0; i < otBooks.length; i++) {
  const bookEl = otBooks[i]
  const bookNameEl = await bookEl.$('.book-name')

  if (!bookNameEl) {
    throw new Error('Bible book name not found')
  }

  const bookName = await page.evaluate(el => {
    // Text node type.
    const textNode = [...el.childNodes].filter(node => node.nodeType === 3)
    if (textNode.length > 1) {
      throw new Error('Multiple text nodes found for Bible book title')
    }

    return textNode[0].textContent.trim()
  }, bookNameEl)

  const chapterLinks = await bookEl.$$('.chapters a')
  const chapterCount = chapterLinks.length

  console.log(bookName, chapterCount)
}

// const ntBooks = await page.$$('.nt-book')

await page.close()
