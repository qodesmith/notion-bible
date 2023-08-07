import fetch from 'node-fetch'
import * as cheerio from 'cheerio'

// The hashtag at the end of the url loads the correct tab on the page.
const bibleGatewayUrl =
  'https://www.biblegateway.com/versions/English-Standard-Version-ESV-Bible#booklist'

try {
  // Fetch the Bible book list page.
  const booksPageResponse = await fetch(bibleGatewayUrl)
  const booksPageHtml = await booksPageResponse.text()
  const $ = cheerio.load(booksPageHtml)

  // Get all the old & new testament sections.
  const otBookSections = $('.ot-book')
  const ntBookSections = $('.nt-book')
  const totalBooksFound = otBookSections.length + ntBookSections.length
  if (totalBooksFound !== 66) {
    throw new Error(`${totalBooksFound} books found, expected 66`)
  }
} catch (e) {
  console.error(e)
} finally {
  process.exit()
}
