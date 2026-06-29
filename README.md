| Сервис | Адрес |  
| Frontend | http://localhost |  
| Backend (health / metrics) | http://localhost:3002 |  
| Prometheus | http://localhost:9090 |  
| Grafana | http://localhost:3001 |  
| Tempo API | http://localhost:3200 |  

## 1. Сборка и запуск

### Windows

```powershell
cd flood-chat
Copy-Item .env.example .env
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --build
```

### Linux

```bash
cd flood-chat
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --build
```

---

Подождать ~30 секунд пока поднимутся все контейнеры. Проверить статус:
```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml ps
```

---

## 2. Проверка метрик бэкенда

Открыть в браузере: **http://localhost:3002/metrics**

Должна появиться страница с текстом в формате Prometheus. Искать строки:

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
# HELP http_request_duration_seconds HTTP request duration in seconds
# HELP chat_messages_total Total number of chat messages sent
# HELP chat_active_users Number of currently connected and joined users
```


Проверить health endpoint:

```powershell
Invoke-RestMethod http://localhost:3002/health
```

```bash
curl -s http://localhost:3002/health
```

Ожидаемый ответ health:
```json
{"status":"healthy","timestamp":"...","uptime":...}
```

---

## 3. Генерация нагрузки

Нужно создать запросы чтобы на дашборде и в Tempo появились данные.

### Windows

```powershell
1..30 | ForEach-Object {
    Invoke-RestMethod http://localhost:3002/health | Out-Null
    Start-Sleep -Milliseconds 200
}
```

### Linux

```bash
for i in $(seq 1 30); do
    curl -s http://localhost:3002/health > /dev/null
    sleep 0.2
done
```

Дополнительно - открыть **http://localhost**, зайти под именем, написать несколько сообщений. Это заполнит бизнес-метрики `chat_messages_total` и `chat_active_users`.

---

## 4. Проверка scrape метрик

Открыть **http://localhost:9090/targets**

На странице Status -> Targets должны быть два job:

| Job | State | Error |  
| `chat-backend` | UP | пусто |  
| `prometheus` | UP | пусто |  


Проверить PromQL в Prometheus UI (**Graph** -> поле Expression):

```promql
up{job="chat-backend"}
```

Результат должен быть `1`.

```promql
http_requests_total{job="chat-backend"}
```

Должны появиться временные ряды с лейблами `route="/health"` и `route="/metrics"`.

---

## 5. Проверка Grafana: метрики и трейс

Открыть **http://localhost:3001**

Войти: **admin** / **admin**.

Слева: **Dashboards - Browse - Chat Backend**

| Панель | Что проверять |
| HTTP RPS by route | Линия `/health` с ненулевыми значениями |  
| HTTP latency p95 by route | Значения в секундах |  
| Chat message rate | Ненулевое значение если отправляли сообщения |  
| Active users | Число подключённых пользователей |  
| HTTP error rate | 0 или близко к нулю |  
| Total messages sent | Ненулевой счётчик |  

Сгенерировать ещё запросы и подождать буферизацию:

#### Windows

```powershell
1..10 | ForEach-Object { Invoke-RestMethod http://localhost:3002/health | Out-Null }
Start-Sleep -Seconds 25
```

#### Linux

```bash
for i in $(seq 1 10); do curl -s http://localhost:3002/health > /dev/null; done
sleep 25
```

В Grafana: **Explore** - источник **Tempo** - **Search** - Service Name: `chat-backend` - **Run query**.


---

## 6. Остановка

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml down
```
Удалить тома (удаляет данные БД и Prometheus):

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml down -v
```
