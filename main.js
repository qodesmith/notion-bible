// @ts-check

import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import {writeJsonSync} from 'fs-extra/esm'

// The hashtag at the end of the url loads the correct tab on the page.
const bibleGatewayUrl = new URL(
  'https://www.biblegateway.com/versions/English-Standard-Version-ESV-Bible#booklist'
)
const originUrl = bibleGatewayUrl.origin

/**
 * Elements with this attribute contain the abbreviated book name which is also
 * used in other elements to denote verses.
 */
const osisDataAttr = 'data-osis'
const dataLocationChapters = './data/chapterUrlData.json'
const dataLocationVerses = './data/verses.json'

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

  // Save url data for all chapters.
  const otUrlData = getTestamentUrlData($, $otBookSections)
  const ntUrlData = getTestamentUrlData($, $ntBookSections)
  writeUrlData({ot: otUrlData, nt: ntUrlData})

  // Get verses.
  const otVerses = await getTestamentVerses(otUrlData)
  console.log('Finished aggregating Old Testament data')
  const ntVerses = await getTestamentVerses(ntUrlData)
  console.log('Finished aggregating New Testament data')
  writeVersesData({ot: otVerses, nt: ntVerses})
} catch (e) {
  console.error(e)
}

/**
 * @param {cheerio.CheerioAPI} $
 * @param {cheerio.Cheerio<cheerio.Element>} $sections
 */
function getTestamentUrlData($, $sections) {
  return [...$sections].map(section => {
    return getBookUrls($, $(section))
  })
}

/**
 * @param {Record<'ot' | 'nt', {bookName: string; chapterUrls: string[]}[]>} data
 */
function writeUrlData(data) {
  writeJsonSync(dataLocationChapters, data, {spaces: 2})
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

/**
 * @param {string} url
 * @param {number} chapter
 */
async function getChapterVerses(url, chapter) {
  const chapterPage = await fetch(url)
  const chapterPageHtml = await chapterPage.text()
  const $ = cheerio.load(chapterPageHtml)

  // Remove all unwanted elements from the page.
  $('sup').remove()
  $('.chapternum').remove()

  // Get book abbreviation and number of verses.
  const osisData = $(`.passage-table[${osisDataAttr}]`).attr(osisDataAttr) ?? ''
  const osisDataArr = osisData.split('.')
  const bookAbbreviation = osisDataArr[0]
  const numOfVerses = Number(osisDataArr.pop())
  if (!bookAbbreviation || !numOfVerses) {
    throw new Error('Error with calculating osis data for chapter')
  }

  // Get all the verses.
  const verses = Array.from({length: numOfVerses}).map((_, i) => {
    const verseNum = i + 1
    const $verseEls = $(`p .${bookAbbreviation}-${chapter}-${verseNum}`)
    const verseText = (() => {
      if ($verseEls.length === 1) return $verseEls.text()

      return [...$verseEls].map(verseEl => $(verseEl).text().trim()).join(' ')
    })()

    return replaceQuotationMarks(verseText)
  })

  return verses
}

/**
 * @param {{bookName: string; chapterUrls: string[]}[]} testamentUrlData
 */
async function getTestamentVerses(testamentUrlData) {
  const bookPromises = testamentUrlData.map(({bookName, chapterUrls}) => {
    const chapterPromises = chapterUrls.map((url, i) => {
      const chapter = i + 1
      const chapterPromise = getChapterVerses(url, chapter).then(verses => {
        return {title: `${bookName} ${chapter}`, verses}
      })

      return chapterPromise
    })

    return Promise.all(chapterPromises).then(chapters => {
      console.log('Completed:', bookName)
      return {bookName, chapters}
    })
  })

  return Promise.all(bookPromises)
}

/**
 * @param {Record<any, any>} data
 */
function writeVersesData(data) {
  console.log('Writing verses data')
  writeJsonSync(dataLocationVerses, data, {spaces: 2})
}

/**
 * @param {string} str
 */
function replaceQuotationMarks(str) {
  return str.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
}
