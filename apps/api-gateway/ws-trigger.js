const API = 'http://localhost:3001/api'

async function request(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`)
    return json.data
}

async function main() {
    console.log('1. Логинюсь за Alice...')
    const alice = await request('/auth/login', {
        method: 'POST',
        body: { email: 'alice@example.com', password: 'password123' },
    })

    console.log('2. Ищу Боба в списке пользователей...')
    const users = await request('/users', { token: alice.accessToken })
    const bob = users.find((u) => u.email === 'bob@example.com')
    if (!bob) throw new Error('Пользователь bob@example.com не найден')
    console.log('   Боб:', bob.id)

    console.log('3. Создаю задачу от имени Alice...')
    const task = await request('/tasks', {
        method: 'POST',
        token: alice.accessToken,
        body: { title: 'Проверка WebSocket-уведомлений' },
    })

    console.log('4. Назначаю задачу Бобу...')
    await request(`/tasks/${task.id}`, {
        method: 'PATCH',
        token: alice.accessToken,
        body: { assigneeId: bob.id },
    })

    console.log()
    console.log('✅ Готово! Задача назначена Бобу.')
    console.log('📣 Смотри на страницу ws-test в браузере — там появилось уведомление?')
}

main().catch((err) => {
    console.error('❌ Ошибка:', err.message)
    process.exit(1)
})