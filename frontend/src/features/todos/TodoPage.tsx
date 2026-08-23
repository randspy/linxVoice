import { eq, useDbClient, useLiveQuery } from '@tanstack/react-db'
import { useForm } from '@tanstack/react-form'
import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'

import { ApiError } from '../../api/client'
import { createTodo, getTodoCollection, removeTodo, type Todo, updateTodo } from './todoCollection'
import { useMutationStatus } from './todoMutationStatus'
import styles from './TodoPage.module.css'

export type TodoFilter = 'all' | 'active' | 'completed'

type TodoPageProps = {
  filter: TodoFilter
  onFilterChange: (filter: TodoFilter) => void
}

const titleSchema = z.string().trim().min(1, 'Give the signal a title.').max(200)

export function TodoPage({ filter, onFilterChange }: TodoPageProps) {
  const client = useDbClient()
  const collection = useMemo(() => getTodoCollection(client), [client])
  const query = useLiveQuery({
    query: (builder) => {
      const todos = builder.from({ todo: collection })
      const filtered =
        filter === 'active'
          ? todos.where(({ todo }) => eq(todo.completed, false))
          : filter === 'completed'
            ? todos.where(({ todo }) => eq(todo.completed, true))
            : todos
      return filtered
        .orderBy(({ todo }) => todo.created_at, 'asc')
        .orderBy(({ todo }) => todo.id, 'asc')
    },
  })
  const mutation = useMutationStatus()
  const connection = mutation.confirmationDelayed
    ? 'delayed'
    : query.isLoading
      ? 'connecting'
      : query.isError || !navigator.onLine
        ? 'disconnected'
        : 'live'
  const allTodos = query.data ?? []

  return (
    <main className={styles.shell}>
      <div className={styles.noise} aria-hidden="true" />
      <header className={styles.masthead}>
        <a className={styles.wordmark} href="/todos" aria-label="linxVoice home">
          linx<span>Voice</span>
        </a>
        <SyncBadge state={connection} pending={mutation.pendingIds.size} />
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>Shared frequency / Todos</p>
          <h1>
            Make it clear.
            <br />
            <em>Watch it move.</em>
          </h1>
        </div>
        <p className={styles.intro}>
          Every change travels through Flask, lands in PostgreSQL, and returns through Electric.
          Open another window—the list speaks for itself.
        </p>
      </section>

      <section className={styles.workspace} aria-labelledby="list-title">
        <CreateTodoForm />
        <div className={styles.listHeader}>
          <div>
            <p className={styles.index}>01</p>
            <h2 id="list-title">Live register</h2>
          </div>
          <FilterTabs active={filter} onChange={onFilterChange} />
        </div>

        {query.isError ? (
          <div className={styles.emptyState} role="alert">
            <strong>The signal dropped.</strong>
            <span>Existing entries remain visible when the connection returns.</span>
          </div>
        ) : allTodos.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>{filter === 'all' ? 'The register is quiet.' : `No ${filter} signals.`}</strong>
            <span>{filter === 'all' ? 'Send the first Todo above.' : 'Try another filter.'}</span>
          </div>
        ) : (
          <ol className={styles.todoList} aria-live="polite">
            {allTodos.map((todo, index) => (
              <TodoRow key={todo.id} todo={todo} index={index + 1} />
            ))}
          </ol>
        )}
      </section>

      <footer className={styles.footer}>
        <span>Flask → PostgreSQL → Electric → TanStack DB</span>
        <span>One source. Many listeners.</span>
      </footer>
    </main>
  )
}

function CreateTodoForm() {
  const client = useDbClient()
  const [submitError, setSubmitError] = useState<string>()
  const form = useForm({
    defaultValues: { title: '' },
    validators: { onSubmit: z.object({ title: titleSchema }) },
    onSubmit: async ({ value, formApi }) => {
      const title = value.title.trim()
      setSubmitError(undefined)
      formApi.reset()
      try {
        await createTodo(client, title)
      } catch (error) {
        setSubmitError(messageFor(error, 'The Todo could not be saved.'))
        if (!formApi.state.values.title) formApi.setFieldValue('title', title)
      }
    },
  })

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field
        name="title"
        validators={{
          onBlur: titleSchema,
          onChange: ({ value }) =>
            value.length > 200 ? 'Keep it under 200 characters.' : undefined,
        }}
      >
        {(field) => (
          <label>
            <span>Broadcast a new Todo</span>
            <input
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="What needs to happen next?"
              autoComplete="off"
              aria-describedby="create-error"
            />
            <small id="create-error" role="alert">
              {field.state.meta.errors.map(formError).filter(Boolean).join(' ') || submitError}
            </small>
          </label>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <button type="submit" disabled={!canSubmit || isSubmitting}>
            <span>{isSubmitting ? 'Confirming' : 'Transmit'}</span>
            <span aria-hidden="true">↗</span>
          </button>
        )}
      </form.Subscribe>
    </form>
  )
}

function TodoRow({ todo, index }: { todo: Todo; index: number }) {
  const client = useDbClient()
  const mutation = useMutationStatus()
  const pending = mutation.pendingIds.has(todo.id)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState<string>()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const editForm = useForm({
    defaultValues: { title: todo.title },
    validators: { onSubmit: z.object({ title: titleSchema }) },
    onSubmit: async ({ value }) => {
      const attempted = value.title.trim()
      setError(undefined)
      try {
        await updateTodo(client, todo, { title: attempted })
        setEditing(false)
        setConflict(undefined)
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 412) setConflict(attempted)
        setError(messageFor(caught, 'The title could not be updated.'))
      }
    },
  })

  async function toggle() {
    setError(undefined)
    try {
      await updateTodo(client, todo, { completed: !todo.completed })
    } catch (caught) {
      setError(messageFor(caught, 'The change was rolled back.'))
    }
  }

  async function confirmDelete() {
    setError(undefined)
    try {
      await removeTodo(client, todo)
    } catch (caught) {
      setError(messageFor(caught, 'The Todo could not be deleted.'))
    } finally {
      setDeleteOpen(false)
    }
  }

  return (
    <li className={`${styles.todoRow}${todo.completed ? ` ${styles.completed}` : ''}`}>
      <span className={styles.rowNumber}>{String(index).padStart(2, '0')}</span>
      <button
        type="button"
        className={styles.check}
        aria-label={todo.completed ? `Mark ${todo.title} active` : `Complete ${todo.title}`}
        aria-pressed={todo.completed}
        disabled={pending}
        onClick={() => void toggle()}
      >
        <span aria-hidden="true">{todo.completed ? '✓' : ''}</span>
      </button>

      <div className={styles.todoBody}>
        {editing ? (
          <form
            className={styles.editForm}
            onSubmit={(event) => {
              event.preventDefault()
              void editForm.handleSubmit()
            }}
          >
            <editForm.Field name="title" validators={{ onBlur: titleSchema }}>
              {(field) => (
                <label>
                  <span className="sr-only">Edit Todo title</span>
                  <input
                    autoFocus
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <small role="alert">
                    {field.state.meta.errors.map(formError).filter(Boolean).join(' ') || error}
                  </small>
                </label>
              )}
            </editForm.Field>
            {conflict ? (
              <p className={styles.conflict}>
                Latest: “{todo.title}” · your draft: “{conflict}”
              </p>
            ) : null}
            <div className={styles.editActions}>
              <button type="submit" disabled={pending}>
                Apply{conflict ? ' again' : ''}
              </button>
              <button
                type="button"
                onClick={() => {
                  editForm.reset({ title: todo.title })
                  setEditing(false)
                  setConflict(undefined)
                  setError(undefined)
                }}
              >
                Discard
              </button>
            </div>
          </form>
        ) : (
          <>
            <button
              type="button"
              className={styles.titleButton}
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              {todo.title}
            </button>
            <span className={styles.meta}>
              v{todo.version} · {formatTimestamp(todo.updated_at)}
              {pending ? ' · awaiting echo' : ''}
            </span>
            {error ? (
              <small className={styles.rowError} role="alert">
                {error}
              </small>
            ) : null}
          </>
        )}
      </div>

      <button
        type="button"
        className={styles.deleteButton}
        aria-label={`Delete ${todo.title}`}
        disabled={pending}
        onClick={() => setDeleteOpen(true)}
      >
        Remove
      </button>

      {deleteOpen ? (
        <DeleteDialog
          todo={todo}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      ) : null}
    </li>
  )
}

function DeleteDialog({
  todo,
  onConfirm,
  onCancel,
}: {
  todo: Todo
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={`delete-${todo.id}`}
      aria-describedby={`delete-note-${todo.id}`}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <p className={styles.kicker}>Permanent action</p>
      <h3 id={`delete-${todo.id}`}>Remove “{todo.title}”?</h3>
      <p id={`delete-note-${todo.id}`}>The deletion will be broadcast to every connected list.</p>
      <div>
        <button type="button" onClick={onConfirm}>
          Remove Todo
        </button>
        <button type="button" autoFocus onClick={onCancel}>
          Keep it
        </button>
      </div>
    </dialog>
  )
}

function FilterTabs({
  active,
  onChange,
}: {
  active: TodoFilter
  onChange: (filter: TodoFilter) => void
}) {
  return (
    <div className={styles.filters} aria-label="Filter Todos">
      {(['all', 'active', 'completed'] as const).map((filter) => (
        <button
          type="button"
          key={filter}
          aria-pressed={active === filter}
          onClick={() => onChange(filter)}
        >
          {filter}
        </button>
      ))}
    </div>
  )
}

function SyncBadge({ state, pending }: { state: string; pending: number }) {
  const label =
    state === 'live'
      ? 'Live signal'
      : state === 'connecting'
        ? 'Acquiring signal'
        : state === 'delayed'
          ? 'Saved, sync delayed'
          : 'Disconnected'
  return (
    <div className={`${styles.syncBadge} ${styles[`sync_${state}`]}`} role="status">
      <span aria-hidden="true" />
      {label}
      {pending ? ` · ${pending} pending` : ''}
    </div>
  )
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formError(error: unknown) {
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return ''
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  )
}
