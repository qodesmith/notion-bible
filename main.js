// @ts-check

import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import {writeFileSync} from 'fs'

// The hashtag at the end of the url loads the correct tab on the page.
const bibleGatewayUrl = new URL(
  'https://www.biblegateway.com/versions/English-Standard-Version-ESV-Bible#booklist'
)
const originUrl = bibleGatewayUrl.origin

try {
  // Fetch the Bible book list page.
  const booksPageResponse = await fetch(bibleGatewayUrl)
  const booksPageHtml = await booksPageResponse.text()
  const $ = cheerio.load(booksPageHtml)

  // Get all the old & new testament sections.
  const $otBookSections = $('.ot-book')
  const $ntBookSections = $('.nt-book')
  const totalBooksFound = $otBookSections.length + $ntBookSections.length
  if (totalBooksFound !== 66) {
    throw new Error(`${totalBooksFound} books found, expected 66`)
  }

  const otUrls = [...$otBookSections].map(section => {
    return getBookUrls($, $(section))
  })
  const ntUrls = [...$ntBookSections].map(section => {
    return getBookUrls($, $(section))
  })
  const bibleUrlJsonData = JSON.stringify({ot: otUrls, nt: ntUrls}, null, 2)

  writeFileSync('data.json', bibleUrlJsonData, 'utf8')
} catch (e) {
  console.error(e)
}

/**
 * @param {cheerio.CheerioAPI} $
 * @param {cheerio.Cheerio<cheerio.Element>} $sectionEl
 */
function getBookName($, $sectionEl) {
  const $bookNameEl = $sectionEl.find('.book-name')
  const {childNodes} = $bookNameEl[0]
  const $textNode = $(childNodes.find(childNode => childNode.nodeType === 3))
  const bookName = $textNode.text().trim()

  if (!bookName.length) {
    throw new Error('Error with getting book name text')
  }

  return bookName
}

/**
 * @param {cheerio.CheerioAPI} $
 * @param {cheerio.Cheerio<cheerio.Element>} $sectionEl
 */
function getChapterUrls($, $sectionEl) {
  const expectedCount = Number($sectionEl.find('.num-chapters').text())
  const $chaptersEl = $sectionEl.find('.chapters')
  const $links = $chaptersEl.find('a')

  if (expectedCount !== $links.length) {
    throw new Error('Mismatch of expected chapters')
  }

  return $links
    .map((i, el) => {
      return new URL($(el).attr('href') ?? '', originUrl).toString()
    })
    .toArray()
}

/**
 * @param {cheerio.CheerioAPI} $
 * @param {cheerio.Cheerio<cheerio.Element>} $sectionEl
 */
function getBookUrls($, $sectionEl) {
  const bookName = getBookName($, $sectionEl)
  const chapterUrls = getChapterUrls($, $sectionEl)

  return {bookName, chapterUrls}
}
