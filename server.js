const path = require("path");
const express = require("express");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DATA_DIR, "data.db");
const PUBLIC_DIR = path.join(__dirname, "public");

const database = new Database(DB_FILE);
database.pragma("journal_mode = WAL");
database.exec(`
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
    CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL
    );
`);

function ensureColumn(databaseInstance, tableName, columnName, columnDefinition)
{
    const columnInfoList = databaseInstance.prepare(`PRAGMA table_info(${tableName})`).all();
    const columnExists = columnInfoList.some((columnInfo) => columnInfo.name === columnName);
    if (columnExists === false)
    {
        databaseInstance.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    }
}

ensureColumn(database, "events", "all_day", "INTEGER NOT NULL DEFAULT 1");
ensureColumn(database, "events", "start_time", "TEXT");
ensureColumn(database, "events", "end_time", "TEXT");
ensureColumn(database, "events", "group_id", "INTEGER");

const application = express();
application.use(express.json());
application.use(express.static(PUBLIC_DIR));

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseDate(value)
{
    if (typeof value !== "string")
    {
        return null;
    }
    if (DATE_PATTERN.test(value) === false)
    {
        return null;
    }
    const dateObject = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(dateObject.getTime()) === true)
    {
        return null;
    }
    return value;
}

function parseTitle(value)
{
    if (typeof value !== "string")
    {
        return null;
    }
    const trimmedTitle = value.trim();
    if (trimmedTitle.length === 0)
    {
        return null;
    }
    if (trimmedTitle.length > 200)
    {
        return null;
    }
    return trimmedTitle;
}

function parseTime(value)
{
    if (typeof value !== "string")
    {
        return null;
    }
    if (TIME_PATTERN.test(value) === false)
    {
        return null;
    }
    return value;
}

function parseAllDay(value)
{
    if (value === true || value === 1)
    {
        return 1;
    }
    if (value === false || value === 0)
    {
        return 0;
    }
    return null;
}

function parseGroupId(value)
{
    if (value === null || value === undefined || value === "")
    {
        return { value: null };
    }
    const numberValue = Number.parseInt(value, 10);
    if (Number.isInteger(numberValue) === false)
    {
        return { error: "group_id가 유효하지 않습니다." };
    }
    return { value: numberValue };
}

function parseGroupName(value)
{
    if (typeof value !== "string")
    {
        return null;
    }
    const trimmedName = value.trim();
    if (trimmedName.length === 0)
    {
        return null;
    }
    if (trimmedName.length > 50)
    {
        return null;
    }
    return trimmedName;
}

function parseColor(value)
{
    if (typeof value !== "string")
    {
        return null;
    }
    if (COLOR_PATTERN.test(value) === false)
    {
        return null;
    }
    return value.toLowerCase();
}

function eventRowToJson(rowObject)
{
    return {
        id: rowObject.id,
        title: rowObject.title,
        date: rowObject.date,
        all_day: rowObject.all_day === 1,
        start_time: rowObject.start_time,
        end_time: rowObject.end_time,
        group_id: rowObject.group_id
    };
}

function groupExists(groupId)
{
    const queryStatement = database.prepare("SELECT id FROM groups WHERE id = ?");
    const rowObject = queryStatement.get(groupId);
    return rowObject !== undefined;
}

function validateEventPayload(requestBody)
{
    const bodyObject = requestBody || {};
    const titleValue = parseTitle(bodyObject.title);
    const dateValue = parseDate(bodyObject.date);
    const allDayValue = parseAllDay(bodyObject.all_day);
    const groupIdResult = parseGroupId(bodyObject.group_id);
    if (titleValue === null)
    {
        return { error: "title이 유효하지 않습니다." };
    }
    if (dateValue === null)
    {
        return { error: "date 형식은 YYYY-MM-DD 여야 합니다." };
    }
    if (allDayValue === null)
    {
        return { error: "all_day는 boolean 이어야 합니다." };
    }
    if (groupIdResult.error !== undefined)
    {
        return { error: groupIdResult.error };
    }
    const groupIdValue = groupIdResult.value;
    if (groupIdValue !== null && groupExists(groupIdValue) === false)
    {
        return { error: "존재하지 않는 group_id 입니다." };
    }
    const basePayload = {
        title: titleValue,
        date: dateValue,
        group_id: groupIdValue
    };
    if (allDayValue === 1)
    {
        return {
            payload: {
                ...basePayload,
                all_day: 1,
                start_time: null,
                end_time: null
            }
        };
    }
    const startTimeValue = parseTime(bodyObject.start_time);
    const endTimeValue = parseTime(bodyObject.end_time);
    if (startTimeValue === null)
    {
        return { error: "start_time 형식은 HH:MM (24시간) 이어야 합니다." };
    }
    if (endTimeValue === null)
    {
        return { error: "end_time 형식은 HH:MM (24시간) 이어야 합니다." };
    }
    if (endTimeValue < startTimeValue)
    {
        return { error: "end_time은 start_time보다 빠를 수 없습니다." };
    }
    return {
        payload: {
            ...basePayload,
            all_day: 0,
            start_time: startTimeValue,
            end_time: endTimeValue
        }
    };
}

const SELECT_EVENT_COLUMNS = "id, title, date, all_day, start_time, end_time, group_id";
const ORDER_EVENT_CLAUSE = "ORDER BY date ASC, all_day DESC, start_time ASC, id ASC";

application.get("/events", (request, response) =>
{
    const yearParameter = request.query.year;
    const monthParameter = request.query.month;
    if (yearParameter !== undefined && monthParameter !== undefined)
    {
        const yearNumber = Number.parseInt(yearParameter, 10);
        const monthNumber = Number.parseInt(monthParameter, 10);
        if (Number.isInteger(yearNumber) === false || Number.isInteger(monthNumber) === false)
        {
            response.status(400).json({ error: "year, month는 정수여야 합니다." });
            return;
        }
        if (monthNumber < 1 || monthNumber > 12)
        {
            response.status(400).json({ error: "month는 1~12 범위여야 합니다." });
            return;
        }
        const monthString = String(monthNumber).padStart(2, "0");
        const prefixPattern = `${yearNumber}-${monthString}-%`;
        const queryStatement = database.prepare(`SELECT ${SELECT_EVENT_COLUMNS} FROM events WHERE date LIKE ? ${ORDER_EVENT_CLAUSE}`);
        const rowList = queryStatement.all(prefixPattern);
        response.json(rowList.map(eventRowToJson));
        return;
    }
    const queryAllStatement = database.prepare(`SELECT ${SELECT_EVENT_COLUMNS} FROM events ${ORDER_EVENT_CLAUSE}`);
    const rowList = queryAllStatement.all();
    response.json(rowList.map(eventRowToJson));
});

application.post("/events", (request, response) =>
{
    const validationResult = validateEventPayload(request.body);
    if (validationResult.error !== undefined)
    {
        response.status(400).json({ error: validationResult.error });
        return;
    }
    const payloadObject = validationResult.payload;
    const insertStatement = database.prepare(
        "INSERT INTO events (title, date, all_day, start_time, end_time, group_id) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const insertResult = insertStatement.run(
        payloadObject.title,
        payloadObject.date,
        payloadObject.all_day,
        payloadObject.start_time,
        payloadObject.end_time,
        payloadObject.group_id
    );
    response.status(201).json({
        id: insertResult.lastInsertRowid,
        title: payloadObject.title,
        date: payloadObject.date,
        all_day: payloadObject.all_day === 1,
        start_time: payloadObject.start_time,
        end_time: payloadObject.end_time,
        group_id: payloadObject.group_id
    });
});

application.put("/events/:id", (request, response) =>
{
    const eventId = Number.parseInt(request.params.id, 10);
    if (Number.isInteger(eventId) === false)
    {
        response.status(400).json({ error: "id가 유효하지 않습니다." });
        return;
    }
    const validationResult = validateEventPayload(request.body);
    if (validationResult.error !== undefined)
    {
        response.status(400).json({ error: validationResult.error });
        return;
    }
    const payloadObject = validationResult.payload;
    const updateStatement = database.prepare(
        "UPDATE events SET title = ?, date = ?, all_day = ?, start_time = ?, end_time = ?, group_id = ? WHERE id = ?"
    );
    const updateResult = updateStatement.run(
        payloadObject.title,
        payloadObject.date,
        payloadObject.all_day,
        payloadObject.start_time,
        payloadObject.end_time,
        payloadObject.group_id,
        eventId
    );
    if (updateResult.changes === 0)
    {
        response.status(404).json({ error: "해당 일정을 찾을 수 없습니다." });
        return;
    }
    response.json({
        id: eventId,
        title: payloadObject.title,
        date: payloadObject.date,
        all_day: payloadObject.all_day === 1,
        start_time: payloadObject.start_time,
        end_time: payloadObject.end_time,
        group_id: payloadObject.group_id
    });
});

application.delete("/events/:id", (request, response) =>
{
    const eventId = Number.parseInt(request.params.id, 10);
    if (Number.isInteger(eventId) === false)
    {
        response.status(400).json({ error: "id가 유효하지 않습니다." });
        return;
    }
    const deleteStatement = database.prepare("DELETE FROM events WHERE id = ?");
    const deleteResult = deleteStatement.run(eventId);
    if (deleteResult.changes === 0)
    {
        response.status(404).json({ error: "해당 일정을 찾을 수 없습니다." });
        return;
    }
    response.status(204).end();
});

application.get("/groups", (request, response) =>
{
    const queryStatement = database.prepare("SELECT id, name, color FROM groups ORDER BY name COLLATE NOCASE ASC, id ASC");
    const rowList = queryStatement.all();
    response.json(rowList);
});

application.post("/groups", (request, response) =>
{
    const bodyObject = request.body || {};
    const nameValue = parseGroupName(bodyObject.name);
    const colorValue = parseColor(bodyObject.color);
    if (nameValue === null)
    {
        response.status(400).json({ error: "그룹 이름은 1~50자여야 합니다." });
        return;
    }
    if (colorValue === null)
    {
        response.status(400).json({ error: "color 형식은 #RGB 또는 #RRGGBB 여야 합니다." });
        return;
    }
    try
    {
        const insertStatement = database.prepare("INSERT INTO groups (name, color) VALUES (?, ?)");
        const insertResult = insertStatement.run(nameValue, colorValue);
        response.status(201).json({
            id: insertResult.lastInsertRowid,
            name: nameValue,
            color: colorValue
        });
    }
    catch (errorObject)
    {
        if (errorObject.code === "SQLITE_CONSTRAINT_UNIQUE")
        {
            response.status(409).json({ error: "같은 이름의 그룹이 이미 존재합니다." });
            return;
        }
        throw errorObject;
    }
});

application.put("/groups/:id", (request, response) =>
{
    const groupId = Number.parseInt(request.params.id, 10);
    if (Number.isInteger(groupId) === false)
    {
        response.status(400).json({ error: "id가 유효하지 않습니다." });
        return;
    }
    const bodyObject = request.body || {};
    const nameValue = parseGroupName(bodyObject.name);
    const colorValue = parseColor(bodyObject.color);
    if (nameValue === null)
    {
        response.status(400).json({ error: "그룹 이름은 1~50자여야 합니다." });
        return;
    }
    if (colorValue === null)
    {
        response.status(400).json({ error: "color 형식은 #RGB 또는 #RRGGBB 여야 합니다." });
        return;
    }
    try
    {
        const updateStatement = database.prepare("UPDATE groups SET name = ?, color = ? WHERE id = ?");
        const updateResult = updateStatement.run(nameValue, colorValue, groupId);
        if (updateResult.changes === 0)
        {
            response.status(404).json({ error: "해당 그룹을 찾을 수 없습니다." });
            return;
        }
        response.json({ id: groupId, name: nameValue, color: colorValue });
    }
    catch (errorObject)
    {
        if (errorObject.code === "SQLITE_CONSTRAINT_UNIQUE")
        {
            response.status(409).json({ error: "같은 이름의 그룹이 이미 존재합니다." });
            return;
        }
        throw errorObject;
    }
});

application.delete("/groups/:id", (request, response) =>
{
    const groupId = Number.parseInt(request.params.id, 10);
    if (Number.isInteger(groupId) === false)
    {
        response.status(400).json({ error: "id가 유효하지 않습니다." });
        return;
    }
    const deleteTransaction = database.transaction((targetGroupId) =>
    {
        database.prepare("UPDATE events SET group_id = NULL WHERE group_id = ?").run(targetGroupId);
        const deleteResult = database.prepare("DELETE FROM groups WHERE id = ?").run(targetGroupId);
        return deleteResult.changes;
    });
    const changeCount = deleteTransaction(groupId);
    if (changeCount === 0)
    {
        response.status(404).json({ error: "해당 그룹을 찾을 수 없습니다." });
        return;
    }
    response.status(204).end();
});

application.listen(PORT, () =>
{
    console.log(`Calendar server listening on http://localhost:${PORT}`);
});
