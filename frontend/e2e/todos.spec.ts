import { expect, test, type Browser, type Page } from '@playwright/test'

test.describe('real-time Todo data flow', () => {
  test('propagates create, complete, and delete across two browsers', async ({ browser }) => {
    const session = await twoBrowserSession(browser)
    const title = uniqueTitle('sync')

    await createTodo(session.first, title)
    await expect(session.second.getByRole('button', { name: title, exact: true })).toBeVisible()

    await session.first.getByRole('button', { name: `Complete ${title}` }).click()
    await expect(session.second.getByRole('button', { name: `Mark ${title} active` })).toBeVisible()

    await session.second.getByRole('button', { name: `Delete ${title}` }).click()
    await session.second.getByRole('button', { name: 'Remove Todo' }).click()
    await expect(session.first.getByRole('button', { name: title, exact: true })).not.toBeVisible()

    await session.close()
  })

  test('preserves a stale rename and offers an explicit retry', async ({ browser }) => {
    const session = await twoBrowserSession(browser)
    const original = uniqueTitle('conflict')
    const winning = `${original} / winner`
    const stale = `${original} / stale draft`
    await createTodo(session.first, original)
    await expect(session.second.getByRole('button', { name: original, exact: true })).toBeVisible()

    let releaseStaleRequest: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      releaseStaleRequest = resolve
    })
    await session.first.route('**/api/v1/todos/*', async (route, request) => {
      if (request.method() === 'PATCH') await held
      await route.continue()
    })

    await beginRename(session.first, original, stale)
    await beginRename(session.second, original, winning)
    await expect(session.second.getByRole('button', { name: winning, exact: true })).toBeVisible()
    releaseStaleRequest?.()

    await expect(
      session.first.getByText(new RegExp(`your draft: “${escapeRegex(stale)}”`)),
    ).toBeVisible()
    await session.first.getByRole('button', { name: 'Discard' }).click()

    await deleteByTitle(session.second, winning)
    await session.close()
  })
})

async function twoBrowserSession(browser: Browser) {
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  const first = await firstContext.newPage()
  const second = await secondContext.newPage()
  await Promise.all([first.goto('/todos?filter=all'), second.goto('/todos?filter=all')])
  await Promise.all([
    expect(first.getByRole('status')).toContainText('Live signal'),
    expect(second.getByRole('status')).toContainText('Live signal'),
  ])
  return {
    first,
    second,
    async close() {
      await Promise.all([firstContext.close(), secondContext.close()])
    },
  }
}

async function createTodo(page: Page, title: string) {
  await page.getByLabel('Broadcast a new Todo').fill(title)
  await page.getByRole('button', { name: 'Transmit' }).click()
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible()
}

async function beginRename(page: Page, currentTitle: string, nextTitle: string) {
  await page.getByRole('button', { name: currentTitle, exact: true }).click()
  await page.getByLabel('Edit Todo title').fill(nextTitle)
  await page.getByRole('button', { name: 'Apply' }).click()
}

async function deleteByTitle(page: Page, title: string) {
  await page.getByRole('button', { name: `Delete ${title}` }).click()
  await page.getByRole('button', { name: 'Remove Todo' }).click()
}

function uniqueTitle(prefix: string) {
  return `e2e/${prefix}/${Date.now()}/${crypto.randomUUID().slice(0, 8)}`
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
