# Perguntas sobre Engenharia Reversa de Aplicativo Móvel

## 1. Estrutura do Projeto

A estrutura principal está organizada da seguinte forma:

- src/app/
  - _layout.tsx
  - index.tsx (Tela 1 — Lista de tarefas, com filtros)
  - task/[id].tsx (Tela 2 — Editor de tarefa)
  - categories.tsx (Tela 3 — Gerenciamento de categorias)
- src/components/
  - Chip.tsx 
  - TaskItem.tsx 
  - DueDateField.tsx 
- src/utils/format.ts 
- `src/hooks/useNow.ts
- src/theme.ts

**Modelos e persistência**

- src/types.ts (tipos Task, Category, TaskInput, StatusFilter, CategoryFilter e a classe ValidationError)
- src/db/
  - schema.ts (criação do banco, migrações com PRAGMA user_version e categorias padrão)
  - tasks.ts (repository de tarefas: SQL, validação e mapeamento linha → objeto)
  - categories.ts (repository de categorias)

**Estado**

- Não existe um store global. Cada tela guarda seu estado com useState e recarrega do SQLite com useFocusEffect.
- src/services/taskService.ts orquestra as operações que mexem ao mesmo tempo no banco e nas notificações.

**Navegação**

- Expo Router (rotas baseadas em arquivos), `Stack` definido em `src/app/_layout.tsx`
- `router.push(...)` / `router.back()` chamados nas telas
- `ReminderSync` em `_layout.tsx` → `useLastNotificationResponse()` abre o editor a partir do toque na notificação

**Notificações**

- `src/notifications/reminders.ts` (wrapper sobre o `expo-notifications`: permissão, canal Android, agendar, cancelar, listar agendadas)
- `app.json` - plugin `expo-notifications` e permissões Android `POST_NOTIFICATIONS` e `SCHEDULE_EXACT_ALARM` aplicadas no `AndroidManifest.xml` gerado pelo prebuild; a pasta `android/` não é versionada. 

**Injeção/dependências**

- `src/app/_layout.tsx`
  - `<SQLiteProvider databaseName="todo.db" onInit={migrateDbIfNeeded}>` abre o banco uma única vez e roda as migrações
  - As telas obtêm o banco com `useSQLiteContext()` e o passam como primeiro parâmetro para as funções dos repositories e do `taskService` (ex.: `listTasks(db, status, category)`)
  - `configureNotificationHandler()` é chamado no carregamento do módulo do layout

## 2. Arquitetura e Estado

A arquitetura é uma estrutura em camadas simples, no estilo repository:

```
screens (src/app) → taskService → repositories (src/db) → SQLite
                              ↘ notifications/reminders → expo-notifications
```

Telas que só leem (ou que só mexem em categorias) chamam os repositories diretamente; operações de escrita em tarefas passam pelo `taskService`, para que o `notification_id` gravado no banco sempre corresponda ao que o sistema operacional tem agendado.

- em `useFocusEffect`, ou seja, toda vez que a tela volta a ficar em foco (ao voltar do editor ou da tela de categorias, a lista é atualizada);
- sempre que um filtro muda (o `load` é um `useCallback` que depende de `status` e `category`);
- depois de cada ação feita na própria tela (alternar conclusão, criar/renomear/excluir categoria).

Assim como no caso do sqflite, o `expo-sqlite` não avisa a interface quando os dados mudam. O fluxo é explícito:

escrever no SQLite → sincronizar o lembrete (e gravar o novo `notification_id`) → a tela recarrega do SQLite → `setState` → re-render

**Criar uma tarefa**
O editor chama `createTask(db, form)` (`taskService`). Ele chama `insertTask()`, que valida a entrada e faz o `INSERT`, devolvendo `lastInsertRowId`. Em seguida relê a tarefa com `getTask()` e chama `syncReminder()`, que agenda o lembrete (se necessário) e grava o `notification_id`. O editor faz `router.back()` e a lista, ao recuperar o foco, recarrega pelo `useFocusEffect`.

**Editar uma tarefa**
O editor chama `saveTask(db, id, form)`, que faz o `UPDATE` (`updateTask()`, que lança erro se `changes === 0`, ou seja, se a tarefa não existe mais), relê a tarefa e chama o mesmo `syncReminder()`.

**Concluir uma tarefa**
O checkbox da lista chama `toggleTaskCompleted(db, id, !task.completed)`, que faz um `UPDATE` só do campo `completed` (`setTaskCompleted()`), relê a tarefa e chama `syncReminder()` com `askPermission = false` (alternar a conclusão pela lista nunca abre o diálogo de permissão). Como o `syncReminder()` sempre cancela o lembrete antigo antes de decidir se agenda outro, uma tarefa concluída fica sem notificação. Depois a lista chama `load()` de novo.

## 3. Persistência com SQLite

O aplicativo usa o **`expo-sqlite`** (módulo oficial do Expo) com a API assíncrona (`runAsync`, `getAllAsync`, `getFirstAsync`, `execAsync`, `withTransactionAsync`) e **SQL escrito à mão**, sem ORM.

A camada de dados fica em:

`src/db/`

O banco é um único arquivo, `todo.db`, aberto pelo `<SQLiteProvider>`.

**Tarefas**

O modelo é `Task` (`src/types.ts`), gravado na tabela `tasks` 

com os campos:

`id`
`title`
`description` (opcional) 
`completed` (INTEGER 0/1, com `CHECK (completed IN (0, 1))`) 
`dueDateTime` (coluna `due_date_time`, opcional) 
`createdAt` (coluna `created_at`) 
`categoryId` (coluna `category_id`, opcional)

Campos adicionais (decisão do agente):

`updatedAt` (coluna `updated_at`) — data da última modificação;
`notificationId` (coluna `notification_id`) — identificador devolvido pelo `scheduleNotificationAsync`, usado para cancelar/reagendar o lembrete.

**Categorias**

O modelo é `Category` (`src/types.ts`), gravado na tabela `categories` 

com os campos:

`id` 
`name` (`UNIQUE COLLATE NOCASE` e `CHECK` de não vazio — impede nomes repetidos ignorando maiúsculas/minúsculas) · 
`color` (decisão adicional do agente, para mostrar o badge colorido da categoria; há uma paleta fixa de 8 cores em `CATEGORY_COLORS`)

Na criação do banco são inseridas quatro categorias padrão: **Personal, Work, Study e Shopping**.

**CRUD**
O acesso aos dados é feito por módulos de funções (repositories), que recebem o `db` como parâmetro:

- `src/db/tasks.ts` → tabela `tasks` (`listTasks`, `getTask`, `insertTask`, `updateTask`, `setTaskCompleted`, `setTaskNotificationId`, `deleteTaskRow`, `listTasksNeedingReminder`)
- `src/db/categories.ts` → tabela `categories` (`listCategories`, `listCategoriesWithCounts`, `createCategory`, `updateCategory`, `deleteCategory`)

Erros de `UNIQUE constraint failed` do SQLite são convertidos (`rethrowUnique()`) em um `ValidationError` com mensagem amigável: `A category named "health" already exists.`

## 4. Acompanhamento de uma Operação

1. **Ponto de partida:** o usuário tocou no botão "+" (FAB da `TaskListScreen`, `src/app/index.tsx`), que chama `router.push({ pathname: '/task/[id]', params: { id: 'new' } })`. O editor (`src/app/task/[id].tsx`) lê `id` com `useLocalSearchParams`, define `isNew = true` e `taskId = null`. Os valores do formulário ficam em um único estado `form: TaskInput` (`title`, `description`, `completed`, `dueDateTime`, `categoryId`), inicializado com `EMPTY_FORM`.

2. **Salvar** — o botão "Save" chama `handleSave()`:

1. Se o título (sem espaços) estiver vazio, mostra o erro inline "Title is required." e não continua.
2. `setSaving(true)` desabilita os botões Save/Cancel/Delete e troca o texto para "Saving…", evitando salvar duas vezes.
3. Como `taskId === null`, chama `createTask(db, form)`.

3. **Validação e gravação no SQLite** — `createTask()` (`src/services/taskService.ts`) chama `insertTask()` (`src/db/tasks.ts`):

- `validateTaskInput()` faz `trim` do título, valida tamanho (≤ 120) e data, e converte descrição vazia em `NULL`. Um problema aqui lança `ValidationError`.
- `INSERT INTO tasks (title, description, completed, due_date_time, created_at, updated_at, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)` com `created_at = updated_at = Date.now()`. O SQLite gera o `id` (AUTOINCREMENT) e a função devolve `result.lastInsertRowId`.
- O service relê a tarefa com `requireTask()` → `getTask()` (`SELECT * FROM tasks WHERE id = ?`), obtendo o objeto `Task` completo.

4. **Agendamento do lembrete** — `syncReminder(db, task, askPermission = true)`:

- `cancelTaskReminder(task.notificationId)` — numa tarefa nova o id é `null`, então não faz nada.
- `scheduleTaskReminder()` (`src/notifications/reminders.ts`):
   - `needsReminder()`: a tarefa está pendente e tem data futura? Se não, devolve `{ status: 'not-needed' }`.
   - Se sim, `requestReminderPermission()`: garante o canal Android `task-reminders`, verifica a permissão e, se ainda não concedida e `canAskAgain`, mostra o diálogo do sistema. Se negada → `{ status: 'permission-denied' }`.
   - `Notifications.scheduleNotificationAsync({ content: { title: 'Task reminder', body: task.title, data: { taskId } }, trigger: { type: DATE, date, channelId } })` → devolve o `notificationId`.
-  Se o id mudou, `setTaskNotificationId()` grava o novo id (ou `NULL`) na coluna `notification_id`.
-  `createTask()` devolve `{ taskId, reminder: ReminderOutcome }`.

**Atualização da lista** — ao voltar, a `TaskListScreen` recupera o foco e o `useFocusEffect` chama `load()`: `listCategories()` e `listTasks(db, status, category)`, que executa o `SELECT ... LEFT JOIN categories` com o `WHERE` dos filtros e `ORDER BY t.completed, t.due_date_time IS NULL, t.due_date_time, t.created_at DESC`. `setTasks()` provoca o re-render e a nova tarefa aparece em um `TaskItem`.
Se um filtro ativo excluir a tarefa (ex.: "Completed"), ela está no banco mas não aparece na lista.


## 5. Navegação

A navegação usa o **Expo Router** (rotas baseadas em arquivos, em `src/app/`), com um navegador **Stack nativo** (`react-native-screens`) definido em `src/app/_layout.tsx`. As telas navegam com `router.push(...)` e voltam com `router.back()`.

Existem três áreas principais:

Task List (`/`) 
        | 
Task Editor (`/task/[id]`) 
        | 
Category Management (`/categories`)

A lista abre o editor (nova tarefa pelo botão "+", com `id = "new"`, ou tarefa existente pelo toque no item) e, pelo link "Categories" no cabeçalho, a tela de categorias. O editor também tem um link "Manage categories".

Para editar uma tarefa existente, o aplicativo **não passa o objeto inteiro**. Ele passa somente o **id**, como parâmetro de rota (string): `router.push({ pathname: '/task/[id]', params: { id: String(item.id) } })`.

O editor lê o id com `useLocalSearchParams`, converte com `Number(id)` e busca a tarefa novamente no SQLite (`getTask()`). O BUILD_LOG justifica: "The editor re-reads the task from SQLite, so it always shows the persisted state and route params stay small/serializable." Com isso, o editor consegue tratar o caso de a tarefa não existir mais (por exemplo, ao tocar numa notificação antiga): mostra "This task no longer exists." e um botão "Go back".

O toque na notificação é tratado pelo componente `ReminderSync` em `_layout.tsx`: `Notifications.useLastNotificationResponse()` entrega a última resposta, o componente lê `data.taskId` e chama `router.push('/task/[id]')`. Um `useRef` guarda o id da última resposta tratada, para não abrir o editor duas vezes. Como o `router` do Expo Router é global, não foi preciso nada equivalente à `navigatorKey` do Flutter.

## 6. Notificações

As notificações são **locais**, sem servidor externo de push.

A implementação utiliza:

`expo-notifications` (`scheduleNotificationAsync` com trigger `DATE`) | alarme agendado pelo módulo no Android (`AlarmManager`) | notificação exibida no canal `task-reminders`

O módulo `src/notifications/reminders.ts` funciona como uma abstração sobre o `expo-notifications`. Ele configura o `setNotificationHandler` (com `shouldShowBanner`/`shouldShowList`, já que `shouldShowAlert` foi descontinuado) para mostrar o banner mesmo com o app aberto, e cria o canal Android `task-reminders` com importância HIGH (no Android 13+ o canal precisa existir antes do pedido de permissão). Não foi necessário tratar fuso horário manualmente: o trigger recebe um `Date` comum.

**Com data futura**
Se a tarefa não estiver concluída e tiver uma data futura, o lembrete é agendado para o horário de vencimento, com o título "Task reminder" e o título da tarefa no corpo.

**Data alterada**
O lembrete anterior é cancelado e uma nova notificação é agendada para a nova data. (Verificado no emulador com `dumpsys alarm`: depois de mudar de 19:00 para 18:20, sobrou só um alarme, com `origWhen=18:20`.)

**Data removida**
A notificação existente é cancelada e `notification_id` vira `NULL`.

**Data no passado**
É permitida, mas o editor mostra o aviso "This date/time is in the past — no reminder will be scheduled.", e na lista tarefas pendentes atrasadas aparecem destacadas em vermelho.

**Tarefa concluída**
A notificação é cancelada.

**Tarefa reaberta**
Se a tarefa voltar a ficar pendente e a data ainda estiver no futuro, o lembrete é agendado novamente (sem pedir permissão, já que vem da lista).

**Tarefa excluída**
`deleteTask()` lê a tarefa, exclui a linha e depois cancela o lembrete com `cancelTaskReminder(task.notificationId)`.

**Permissões**

- `POST_NOTIFICATIONS` é pedida **no contexto**, na primeira vez que o usuário salva uma tarefa que realmente precisa de lembrete.
- Se o usuário negar, a tarefa é salva mesmo assim e um `Alert` explica que nenhum lembrete será exibido e que é possível ativar nas configurações do sistema.
- `SCHEDULE_EXACT_ALARM` está declarada no `app.json`, mas o app não pede essa permissão em tempo de execução. Como o Android 14+ nega essa permissão por padrão, o `dumpsys alarm` mostrou uma janela de entrega (ex.: `+4m` para um lembrete daqui a ~7 min): o lembrete pode chegar alguns minutos atrasado.
- **Reparo na inicialização:** ao abrir o app, `ReminderSync` chama `repairReminders()`, que busca as tarefas pendentes com data futura (`listTasksNeedingReminder()`), compara com `getAllScheduledNotificationsAsync()` e reagenda as que estão faltando (por exemplo, se a permissão foi concedida depois ou o sistema descartou o alarme), sem pedir permissão.
- Toda chamada ao `expo-notifications` fica dentro de `try/catch` e devolve um `ReminderOutcome` (`scheduled`, `not-needed`, `permission-denied`, `error`), para que uma falha no lembrete nunca derrube o app.

## 7. Decisões do Agente

**Trocar Expo Go por development build**
O plano inicial era validar no Expo Go; depois do erro descrito na seção 8, o agente adotou um development build (`expo-dev-client` + `npx expo run:android`), mantendo a pasta `android/` gerada e fora do Git (Continuous Native Generation).

## 8. Análise do BUILD_LOG

**Erro principal: `expo-notifications` não funciona no Expo Go**

*Problema:* no primeiro teste no emulador, o app nem renderizou. Primeiro o aparelho ficou parado em "Bundling 56%..." (a rede do laboratório bloqueava o IP da LAN; resolvido com `adb reverse tcp:8082 tcp:8082` e `exp://127.0.0.1:8082`). Depois apareceu a tela vermelha:

```
Uncaught Error: expo-notifications: Android Push notifications (remote notifications)
functionality provided by expo-notifications was removed from Expo Go with the release
of SDK 53. Use a development build instead of Expo Go.
```

seguida de `Route "./_layout.tsx" is missing the required default export`. Lendo o código em `node_modules/expo-notifications/build`, o agente descobriu a causa: o ponto de entrada do pacote importa um módulo com efeito colateral (`DevicePushTokenAutoRegistration.fx.js`) que, já no import, chama uma função que **lança erro no Android dentro do Expo Go**.

*Suposição incorreta:* na Entry 1 o agente tinha concluído, pela documentação, que notificações **locais** ainda funcionavam no Expo Go. Com `expo-notifications@57.0.22` o módulo não pode nem ser importado ali. Ou seja, a primeira solução (validar no Expo Go) **não funcionou**.

*Alternativas consideradas:* importar arquivos internos de `expo-notifications/build/...` para pular o módulo problemático (rejeitado: depende de detalhes privados do pacote) e desativar notificações no Expo Go (rejeitado: a especificação exige notificações funcionando).

*Solução escolhida:* usar um **development build** (`expo-dev-client` + `npx expo run:android`), como recomendam a própria mensagem de erro, a documentação e o `AGENTS.md`.

**Consequência: o build nativo exigiu várias tentativas**

1. *Gradle: "Unable to establish loopback connection"* — no Windows, o JDK 16+ usa sockets AF_UNIX na pasta temporária para o `Selector` do NIO; o `connect` falhava com EINVAL. Tentativas que **não** funcionaram: rodar pelo PowerShell em vez do Git Bash; trocar `TEMP`/`TMP` do caminho curto 8.3 para o longo; rodar fora do sandbox do agente; usar o JDK 25 em vez do 17. O que funcionou: `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\gtmp`, ou seja, uma pasta **fora do perfil do usuário do laboratório** (provavelmente uma política do ambiente do laboratório).
2. *Ninja: "Filename longer than 260 characters"* — a compilação C++ do `react-native-gesture-handler` gerava um caminho de 364 caracteres (e mesmo um projeto em `C:\t` daria ~294). Primeira tentativa: mapear o projeto para uma unidade com `subst T:` — **falhou** (o autolinking do Expo misturava os caminhos `T:` e `C:`). Habilitar caminhos longos no Windows exigiria alterar o registro como administrador, o que o agente não quis fazer numa máquina do laboratório. Segunda tentativa, que funcionou: o agente verificou que o `react-native-gesture-handler` não é dependência do app, e sim uma peer opcional do `expo-router` usada só pelo `expo-router/js-stack` (o app usa o Stack nativo), e o excluiu do autolinking em `package.json` (`"expo": { "autolinking": { "exclude": ["react-native-gesture-handler"] } }`). Resultado: `BUILD SUCCESSFUL in 2m 57s`.

**Bug encontrado só rodando o app: seletor de hora do Android resetava a seleção**
No teste manual de "alterar a data → reagendar", ao escolher 6h15 o diálogo voltava para 7h00. Causa (lida em `datetimepicker.android.js`): o componente declarativo `<DateTimePicker>` reabre o diálogo num efeito que depende dos callbacks; o `DueDateField` passava arrow functions inline e o editor re-renderiza a cada 30 s por causa do `useNow` — ou seja, uma interação entre duas decisões anteriores que typecheck e lint não detectam. A correção foi usar a API imperativa `DateTimePickerAndroid.open()` no Android (o iOS continua com os pickers inline). Funcionou de primeira.

**Resultado final**
`npx expo-doctor` 21/21, `tsc` e `expo lint` sem problemas. Os critérios de aceitação foram validados no emulador (Android 16) com automação via `adb` e conferindo o estado do sistema diretamente (`dumpsys alarm`, `dumpsys notification`): criar tarefa, pedido de permissão, agendamento, concluir/reabrir (alarmes 1 → 0 → 1), editar a hora, disparo da notificação, categoria duplicada, renomear/excluir categoria, filtros, exclusão de tarefa e persistência após `force-stop`. O app também foi instalado num celular físico (Redmi Note 13), onde o `--device` precisou do nome do modelo (`23129RA5FL`) em vez do serial. Não há testes unitários automatizados neste projeto, e o iOS não foi testado (sem macOS).

**Observação:** Vários problemas exigiram mais de uma tentativa, principalmente a suposição errada sobre o Expo Go e as falhas do build nativo no Windows do laboratório.
