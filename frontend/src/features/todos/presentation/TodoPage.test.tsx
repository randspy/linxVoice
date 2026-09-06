import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TodoConflictError } from '../application/todoErrors'
import type { TodoMutationSnapshot } from '../application/todoMutationStore'
import type { Todo, TodoFilter } from '../domain/todo'
import { TodoPage } from './TodoPage'

const mocks = vi.hoisted(() => ({
  todos: [] as Todo[],
  queryState: { isLoading: false, isError: false },
  create: vi.fn(() => Promise.resolve()),
  rename: vi.fn(() => Promise.resolve()),
  setCompleted: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
}))

let mutations: TodoMutationSnapshot

describe('live Todo register', () => {
  beforeEach(() => {
    mocks.todos = []
    mocks.queryState = { isLoading: false, isError: false }
    mocks.create.mockReset().mockResolvedValue(undefined)
    mocks.rename.mockReset().mockResolvedValue(undefined)
    mocks.setCompleted.mockReset().mockResolvedValue(undefined)
    mocks.remove.mockReset().mockResolvedValue(undefined)
    mutations = { pendingIds: new Set(), confirmationDelayed: false }
  })

  it('creates a Todo from the broadcast form', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Broadcast a new Todo'), 'Trace the first signal')
    await user.click(screen.getByRole('button', { name: 'Transmit' }))

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('Trace the first signal'))
    expect(screen.getByLabelText('Broadcast a new Todo')).toHaveValue('')
  })

  it('changes filters through the public route callback', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    renderPage({ onFilterChange })

    await user.click(screen.getByRole('button', { name: 'active' }))

    expect(onFilterChange).toHaveBeenCalledWith('active')
  })

  it('restores the title when creation definitively fails', async () => {
    const user = userEvent.setup()
    mocks.create.mockRejectedValueOnce(new Error('Database refused the write'))
    renderPage()

    await user.type(screen.getByLabelText('Broadcast a new Todo'), 'Do not lose me')
    await user.click(screen.getByRole('button', { name: 'Transmit' }))

    expect(await screen.findByText('Database refused the write')).toBeVisible()
    expect(screen.getByPlaceholderText('What needs to happen next?')).toHaveValue('Do not lose me')
  })

  it('toggles, renames, and deletes a synchronized Todo', async () => {
    const user = userEvent.setup()
    const todo = todoFactory()
    mocks.todos = [todo]
    renderPage()

    await user.click(screen.getByRole('button', { name: `Complete ${todo.title}` }))
    expect(mocks.setCompleted).toHaveBeenCalledWith(todo, true)

    await user.click(screen.getByRole('button', { name: todo.title }))
    const editor = screen.getByLabelText('Edit Todo title')
    await user.clear(editor)
    await user.type(editor, 'Renamed signal')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith(todo, 'Renamed signal'))

    await user.click(screen.getByRole('button', { name: `Delete ${todo.title}` }))
    expect(screen.getByRole('dialog')).toHaveTextContent(`Remove “${todo.title}”?`)
    await user.click(screen.getByRole('button', { name: 'Remove Todo' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(todo))
  })

  it('does not misrepresent an empty filter as a loading state', () => {
    renderPage({ filter: 'completed' })

    expect(screen.getByText('No completed signals.')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Live signal')
  })

  it('shows connecting and delayed confirmation states', () => {
    mocks.queryState = { isLoading: true, isError: false }
    const view = renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Acquiring signal')

    mutations = { pendingIds: new Set(), confirmationDelayed: true }
    view.rerender(page())
    expect(screen.getByRole('status')).toHaveTextContent('Saved, sync delayed')
  })

  it('locks a Todo while its command awaits confirmation', () => {
    const todo = todoFactory()
    mocks.todos = [todo]
    mutations = { pendingIds: new Set([todo.id]), confirmationDelayed: false }
    renderPage()

    expect(screen.getByRole('button', { name: `Complete ${todo.title}` })).toBeDisabled()
    expect(screen.getByText(/awaiting echo/)).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('1 pending')
  })

  it('shows a rolled-back toggle error', async () => {
    const user = userEvent.setup()
    const todo = todoFactory()
    mocks.todos = [todo]
    mocks.setCompleted.mockRejectedValueOnce(new Error('Version changed elsewhere'))
    renderPage()

    await user.click(screen.getByRole('button', { name: `Complete ${todo.title}` }))

    expect(await screen.findByText('Version changed elsewhere')).toBeVisible()
  })

  it('preserves a stale rename and lets the user apply it again', async () => {
    const user = userEvent.setup()
    const todo = todoFactory()
    mocks.todos = [todo]
    mocks.rename.mockRejectedValueOnce(
      new TodoConflictError('The Todo changed since it was synchronized.'),
    )
    renderPage()

    await user.click(screen.getByRole('button', { name: todo.title }))
    await user.clear(screen.getByLabelText('Edit Todo title'))
    await user.type(screen.getByLabelText('Edit Todo title'), 'My careful draft')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(await screen.findByText(/your draft: “My careful draft”/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Apply again' }))
    await waitFor(() => expect(mocks.rename).toHaveBeenCalledTimes(2))
  })

  it('discards an inline edit without issuing a command', async () => {
    const user = userEvent.setup()
    const todo = todoFactory()
    mocks.todos = [todo]
    renderPage()

    await user.click(screen.getByRole('button', { name: todo.title }))
    await user.clear(screen.getByLabelText('Edit Todo title'))
    await user.type(screen.getByLabelText('Edit Todo title'), 'Discard this')
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.getByRole('button', { name: todo.title })).toBeVisible()
    expect(mocks.rename).not.toHaveBeenCalled()
  })

  it('can cancel deletion and reports a failed confirmed deletion', async () => {
    const user = userEvent.setup()
    const todo = todoFactory()
    mocks.todos = [todo]
    renderPage()

    await user.click(screen.getByRole('button', { name: `Delete ${todo.title}` }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    mocks.remove.mockRejectedValueOnce(new Error('Delete lost the race'))
    await user.click(screen.getByRole('button', { name: `Delete ${todo.title}` }))
    await user.click(screen.getByRole('button', { name: 'Remove Todo' }))
    expect(await screen.findByText('Delete lost the race')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders completed Todos with the inverse toggle action', () => {
    const todo = todoFactory({ completed: true })
    mocks.todos = [todo]
    renderPage()

    expect(screen.getByRole('button', { name: `Mark ${todo.title} active` })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('announces a disconnected collection', () => {
    mocks.queryState = { isLoading: false, isError: true }
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Disconnected')
    expect(screen.getByText('The signal dropped.')).toBeVisible()
  })
})

type PageOverrides = { filter?: TodoFilter; onFilterChange?: (filter: TodoFilter) => void }

function renderPage(overrides: PageOverrides = {}) {
  return render(page(overrides))
}

function page(overrides: PageOverrides = {}) {
  return (
    <TodoPage
      filter={overrides.filter ?? 'all'}
      onFilterChange={overrides.onFilterChange ?? vi.fn()}
      todos={mocks.todos}
      queryState={mocks.queryState}
      mutations={mutations}
      commands={mocks}
      isOnline
    />
  )
}

function todoFactory(overrides: Partial<Todo> = {}): Todo {
  return {
    id: '0198d8b6-6535-7a68-a6ec-45bfbe0d4191',
    title: 'Open a second window',
    completed: false,
    created_at: '2026-08-23T12:00:00Z',
    updated_at: '2026-08-23T12:00:00Z',
    version: 2,
    ...overrides,
  }
}
