import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../api/client'
import type { Todo } from './todoCollection'
import { TodoPage } from './TodoPage'
import { mutationStatus } from './todoMutationStatus'

const mocks = vi.hoisted(() => ({
  todos: [] as Todo[],
  queryState: { isLoading: false, isError: false },
  createTodo: vi.fn(() => Promise.resolve()),
  updateTodo: vi.fn(() => Promise.resolve()),
  removeTodo: vi.fn(() => Promise.resolve()),
}))

vi.mock('@tanstack/react-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return {
    ...actual,
    eq: vi.fn(),
    useDbClient: () => ({ name: 'test-client' }),
    useLiveQuery: (
      input: ((builder: unknown) => unknown) | { query: (builder: unknown) => unknown },
    ) => {
      const query = typeof input === 'function' ? input : input.query
      const chain = {
        where: vi.fn((predicate: (row: { todo: Todo }) => unknown) => {
          predicate({ todo: todoFactory() })
          return chain
        }),
        orderBy: vi.fn((selector: (row: { todo: Todo }) => unknown) => {
          selector({ todo: todoFactory() })
          return chain
        }),
      }
      query({ from: () => chain })
      return { data: mocks.todos, ...mocks.queryState }
    },
  }
})

vi.mock('./todoCollection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./todoCollection')>()
  return {
    ...actual,
    getTodoCollection: () => ({ name: 'test-collection' }),
    createTodo: mocks.createTodo,
    updateTodo: mocks.updateTodo,
    removeTodo: mocks.removeTodo,
  }
})

describe('live Todo register', () => {
  beforeEach(() => {
    mocks.todos = []
    mocks.queryState = { isLoading: false, isError: false }
    mocks.createTodo.mockClear()
    mocks.updateTodo.mockClear()
    mocks.removeTodo.mockClear()
    mocks.createTodo.mockResolvedValue(undefined)
    mocks.updateTodo.mockResolvedValue(undefined)
    mocks.removeTodo.mockResolvedValue(undefined)
    mutationStatus.reset()
  })

  it('creates a Todo from the broadcast form', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Broadcast a new Todo'), 'Trace the first signal')
    await user.click(screen.getByRole('button', { name: 'Transmit' }))

    await waitFor(() =>
      expect(mocks.createTodo).toHaveBeenCalledWith(expect.anything(), 'Trace the first signal'),
    )
    expect(screen.getByLabelText('Broadcast a new Todo')).toHaveValue('')
  })

  it('changes filters through the public route callback', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    render(<TodoPage filter="all" onFilterChange={onFilterChange} />)

    await user.click(screen.getByRole('button', { name: 'active' }))

    expect(onFilterChange).toHaveBeenCalledWith('active')
  })

  it('restores the title when creation definitively fails', async () => {
    const user = userEvent.setup()
    mocks.createTodo.mockRejectedValueOnce(new Error('Database refused the write'))
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
    expect(mocks.updateTodo).toHaveBeenCalledWith(expect.anything(), todo, { completed: true })

    await user.click(screen.getByRole('button', { name: todo.title }))
    const editor = screen.getByLabelText('Edit Todo title')
    await user.clear(editor)
    await user.type(editor, 'Renamed signal')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(mocks.updateTodo).toHaveBeenCalledWith(expect.anything(), todo, {
        title: 'Renamed signal',
      }),
    )

    await user.click(screen.getByRole('button', { name: `Delete ${todo.title}` }))
    expect(screen.getByRole('dialog')).toHaveTextContent(`Remove “${todo.title}”?`)
    await user.click(screen.getByRole('button', { name: 'Remove Todo' }))
    await waitFor(() => expect(mocks.removeTodo).toHaveBeenCalledWith(expect.anything(), todo))
  })

  it('does not misrepresent an empty filter as a loading state', () => {
    render(<TodoPage filter="completed" onFilterChange={vi.fn()} />)

    expect(screen.getByText('No completed signals.')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Live signal')
  })

  it('shows connecting and delayed confirmation states', () => {
    mocks.queryState = { isLoading: true, isError: false }
    const view = renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Acquiring signal')

    mutationStatus.delayed()
    view.rerender(<TodoPage filter="all" onFilterChange={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved, sync delayed')
  })

  it('locks a Todo while its command awaits confirmation', () => {
    const todo = todoFactory()
    mocks.todos = [todo]
    mutationStatus.begin(todo.id)
    renderPage()

    expect(screen.getByRole('button', { name: `Complete ${todo.title}` })).toBeDisabled()
    expect(screen.getByText(/awaiting echo/)).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('1 pending')
  })

  it('shows a rolled-back toggle error', async () => {
    const user = userEvent.setup()
    const todo = todoFactory()
    mocks.todos = [todo]
    mocks.updateTodo.mockRejectedValueOnce(new Error('Version changed elsewhere'))
    renderPage()

    await user.click(screen.getByRole('button', { name: `Complete ${todo.title}` }))

    expect(await screen.findByText('Version changed elsewhere')).toBeVisible()
  })

  it('preserves a stale rename and lets the user apply it again', async () => {
    const user = userEvent.setup()
    const todo = todoFactory()
    mocks.todos = [todo]
    mocks.updateTodo.mockRejectedValueOnce(
      new ApiError('The Todo changed since it was synchronized.', { status: 412 }),
    )
    renderPage()

    await user.click(screen.getByRole('button', { name: todo.title }))
    await user.clear(screen.getByLabelText('Edit Todo title'))
    await user.type(screen.getByLabelText('Edit Todo title'), 'My careful draft')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(await screen.findByText(/your draft: “My careful draft”/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Apply again' }))
    await waitFor(() => expect(mocks.updateTodo).toHaveBeenCalledTimes(2))
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
    expect(mocks.updateTodo).not.toHaveBeenCalled()
  })

  it('can cancel deletion and reports a failed confirmed deletion', async () => {
    const user = userEvent.setup()
    const todo = todoFactory()
    mocks.todos = [todo]
    renderPage()

    await user.click(screen.getByRole('button', { name: `Delete ${todo.title}` }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    mocks.removeTodo.mockRejectedValueOnce(new Error('Delete lost the race'))
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

function renderPage() {
  return render(<TodoPage filter="all" onFilterChange={vi.fn()} />)
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
