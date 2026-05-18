const MONTH_NAMES_KO = [
    "1월", "2월", "3월", "4월", "5월", "6월",
    "7월", "8월", "9월", "10월", "11월", "12월"
];
const WEEKDAY_NAMES_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WEEK_START_STORAGE_KEY = "calendar.weekStart";
const HIDDEN_GROUPS_STORAGE_KEY = "calendar.hiddenGroups";
const NO_GROUP_FILTER_KEY = "none";
const DEFAULT_EVENT_COLOR = "#2f6fed";
const DEFAULT_ALL_DAY_COLOR = "#3a7a3a";

const calendarGridElement = document.getElementById("calendarGrid");
const weekdayRowElement = document.getElementById("weekdayRow");
const filterBarElement = document.getElementById("filterBar");
const currentMonthLabelElement = document.getElementById("currentMonthLabel");
const previousMonthButtonElement = document.getElementById("previousMonthButton");
const nextMonthButtonElement = document.getElementById("nextMonthButton");
const todayButtonElement = document.getElementById("todayButton");
const weekStartToggleButtonElement = document.getElementById("weekStartToggleButton");
const manageGroupsButtonElement = document.getElementById("manageGroupsButton");

const eventDialogBackdropElement = document.getElementById("eventDialogBackdrop");
const eventDialogTitleElement = document.getElementById("eventDialogTitle");
const eventDateInputElement = document.getElementById("eventDateInput");
const eventAllDayInputElement = document.getElementById("eventAllDayInput");
const eventStartTimeInputElement = document.getElementById("eventStartTimeInput");
const eventEndTimeInputElement = document.getElementById("eventEndTimeInput");
const eventGroupSelectElement = document.getElementById("eventGroupSelect");
const eventTitleInputElement = document.getElementById("eventTitleInput");
const eventDeleteButtonElement = document.getElementById("eventDeleteButton");
const eventCancelButtonElement = document.getElementById("eventCancelButton");
const eventSaveButtonElement = document.getElementById("eventSaveButton");

const groupDialogBackdropElement = document.getElementById("groupDialogBackdrop");
const groupListContainerElement = document.getElementById("groupListContainer");
const newGroupNameInputElement = document.getElementById("newGroupNameInput");
const newGroupColorInputElement = document.getElementById("newGroupColorInput");
const addGroupButtonElement = document.getElementById("addGroupButton");
const groupDialogCloseButtonElement = document.getElementById("groupDialogCloseButton");

let currentYear = 0;
let currentMonth = 0;
let currentWeekStart = 0;
let currentMonthEventList = [];
let currentGroupList = [];
let currentGroupMap = new Map();
let hiddenGroupKeySet = new Set();
let editingEventId = null;

function formatDateString(year, monthIndex, day)
{
    const yearString = String(year);
    const monthString = String(monthIndex + 1).padStart(2, "0");
    const dayString = String(day).padStart(2, "0");
    return `${yearString}-${monthString}-${dayString}`;
}

function todayDateString()
{
    const nowDate = new Date();
    return formatDateString(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
}

function loadWeekStart()
{
    const storedValue = window.localStorage.getItem(WEEK_START_STORAGE_KEY);
    if (storedValue === "1")
    {
        return 1;
    }
    return 0;
}

function saveWeekStart(weekStartValue)
{
    window.localStorage.setItem(WEEK_START_STORAGE_KEY, String(weekStartValue));
}

function loadHiddenGroupKeySet()
{
    const storedValue = window.localStorage.getItem(HIDDEN_GROUPS_STORAGE_KEY);
    if (typeof storedValue !== "string" || storedValue.length === 0)
    {
        return new Set();
    }
    try
    {
        const parsedArray = JSON.parse(storedValue);
        if (Array.isArray(parsedArray) === false)
        {
            return new Set();
        }
        return new Set(parsedArray.map((entry) => String(entry)));
    }
    catch (errorObject)
    {
        return new Set();
    }
}

function saveHiddenGroupKeySet(keySet)
{
    const keyArray = Array.from(keySet);
    window.localStorage.setItem(HIDDEN_GROUPS_STORAGE_KEY, JSON.stringify(keyArray));
}

function groupKeyForEvent(eventRecord)
{
    if (eventRecord.group_id === null || eventRecord.group_id === undefined)
    {
        return NO_GROUP_FILTER_KEY;
    }
    return String(eventRecord.group_id);
}

function columnIndexForWeekday(weekdayIndex)
{
    return (weekdayIndex - currentWeekStart + 7) % 7;
}

function weekdayIndexForColumn(columnIndex)
{
    return (columnIndex + currentWeekStart) % 7;
}

async function fetchMonthEvents(year, monthHumanIndex)
{
    const requestUrl = `/events?year=${year}&month=${monthHumanIndex}`;
    const responseObject = await fetch(requestUrl);
    if (responseObject.ok === false)
    {
        throw new Error(`이벤트 조회 실패: ${responseObject.status}`);
    }
    const eventList = await responseObject.json();
    return eventList;
}

async function fetchGroups()
{
    const responseObject = await fetch("/groups");
    if (responseObject.ok === false)
    {
        throw new Error(`그룹 조회 실패: ${responseObject.status}`);
    }
    const groupList = await responseObject.json();
    return groupList;
}

async function createEvent(payloadObject)
{
    const responseObject = await fetch("/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadObject)
    });
    if (responseObject.ok === false)
    {
        const errorBody = await responseObject.json().catch(() => ({}));
        throw new Error(errorBody.error || `이벤트 생성 실패: ${responseObject.status}`);
    }
    return await responseObject.json();
}

async function updateEvent(eventId, payloadObject)
{
    const responseObject = await fetch(`/events/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadObject)
    });
    if (responseObject.ok === false)
    {
        const errorBody = await responseObject.json().catch(() => ({}));
        throw new Error(errorBody.error || `이벤트 수정 실패: ${responseObject.status}`);
    }
    return await responseObject.json();
}

async function deleteEvent(eventId)
{
    const responseObject = await fetch(`/events/${eventId}`, { method: "DELETE" });
    if (responseObject.ok === false)
    {
        throw new Error(`이벤트 삭제 실패: ${responseObject.status}`);
    }
}

async function createGroup(payloadObject)
{
    const responseObject = await fetch("/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadObject)
    });
    if (responseObject.ok === false)
    {
        const errorBody = await responseObject.json().catch(() => ({}));
        throw new Error(errorBody.error || `그룹 생성 실패: ${responseObject.status}`);
    }
    return await responseObject.json();
}

async function updateGroup(groupId, payloadObject)
{
    const responseObject = await fetch(`/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadObject)
    });
    if (responseObject.ok === false)
    {
        const errorBody = await responseObject.json().catch(() => ({}));
        throw new Error(errorBody.error || `그룹 수정 실패: ${responseObject.status}`);
    }
    return await responseObject.json();
}

async function deleteGroup(groupId)
{
    const responseObject = await fetch(`/groups/${groupId}`, { method: "DELETE" });
    if (responseObject.ok === false)
    {
        const errorBody = await responseObject.json().catch(() => ({}));
        throw new Error(errorBody.error || `그룹 삭제 실패: ${responseObject.status}`);
    }
}

function groupEventsByDate(eventList)
{
    const eventsByDateMap = new Map();
    for (const eventRecord of eventList)
    {
        const existingList = eventsByDateMap.get(eventRecord.date);
        if (existingList === undefined)
        {
            eventsByDateMap.set(eventRecord.date, [eventRecord]);
        }
        else
        {
            existingList.push(eventRecord);
        }
    }
    return eventsByDateMap;
}

function filterVisibleEvents(eventList)
{
    return eventList.filter((eventRecord) =>
    {
        const filterKey = groupKeyForEvent(eventRecord);
        return hiddenGroupKeySet.has(filterKey) === false;
    });
}

function colorForEvent(eventRecord)
{
    if (eventRecord.group_id !== null && eventRecord.group_id !== undefined)
    {
        const groupRecord = currentGroupMap.get(eventRecord.group_id);
        if (groupRecord !== undefined)
        {
            return groupRecord.color;
        }
    }
    if (eventRecord.all_day === true)
    {
        return DEFAULT_ALL_DAY_COLOR;
    }
    return DEFAULT_EVENT_COLOR;
}

function buildChipLabel(eventRecord)
{
    if (eventRecord.all_day === true)
    {
        return eventRecord.title;
    }
    if (typeof eventRecord.start_time === "string" && eventRecord.start_time.length > 0)
    {
        return `${eventRecord.start_time} ${eventRecord.title}`;
    }
    return eventRecord.title;
}

function buildChipTooltip(eventRecord)
{
    const partList = [];
    if (eventRecord.all_day === true)
    {
        partList.push(`${eventRecord.title} (종일)`);
    }
    else
    {
        const startTimeText = eventRecord.start_time || "";
        const endTimeText = eventRecord.end_time || "";
        if (startTimeText.length > 0 && endTimeText.length > 0)
        {
            partList.push(`${startTimeText} ~ ${endTimeText}  ${eventRecord.title}`);
        }
        else
        {
            partList.push(eventRecord.title);
        }
    }
    if (eventRecord.group_id !== null && eventRecord.group_id !== undefined)
    {
        const groupRecord = currentGroupMap.get(eventRecord.group_id);
        if (groupRecord !== undefined)
        {
            partList.push(`[${groupRecord.name}]`);
        }
    }
    return partList.join(" ");
}

function buildDayCellElement(cellDate, isInCurrentMonth, eventListForDate)
{
    const dayCellElement = document.createElement("div");
    dayCellElement.className = "day-cell";
    if (isInCurrentMonth === false)
    {
        dayCellElement.classList.add("outside-month");
    }
    const weekdayIndex = cellDate.getDay();
    dayCellElement.classList.add(`weekday-${weekdayIndex}`);
    const cellDateString = formatDateString(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
    if (cellDateString === todayDateString())
    {
        dayCellElement.classList.add("today");
    }

    const dayNumberElement = document.createElement("div");
    dayNumberElement.className = "day-number";
    dayNumberElement.textContent = String(cellDate.getDate());
    dayCellElement.appendChild(dayNumberElement);

    const eventListContainerElement = document.createElement("div");
    eventListContainerElement.className = "event-list";
    dayCellElement.appendChild(eventListContainerElement);

    for (const eventRecord of eventListForDate)
    {
        const eventChipElement = document.createElement("div");
        eventChipElement.className = "event-chip";
        if (eventRecord.all_day === true)
        {
            eventChipElement.classList.add("all-day");
        }
        eventChipElement.style.backgroundColor = colorForEvent(eventRecord);
        eventChipElement.textContent = buildChipLabel(eventRecord);
        eventChipElement.title = buildChipTooltip(eventRecord);
        eventChipElement.addEventListener("click", (clickEvent) =>
        {
            clickEvent.stopPropagation();
            openEventDialogForEdit(eventRecord);
        });
        eventListContainerElement.appendChild(eventChipElement);
    }

    dayCellElement.addEventListener("click", () =>
    {
        openEventDialogForCreate(cellDateString);
    });

    return dayCellElement;
}

function renderWeekdayRow()
{
    weekdayRowElement.replaceChildren();
    for (let columnIndex = 0; columnIndex < 7; columnIndex += 1)
    {
        const weekdayIndex = weekdayIndexForColumn(columnIndex);
        const labelElement = document.createElement("div");
        labelElement.textContent = WEEKDAY_NAMES_KO[weekdayIndex];
        labelElement.classList.add(`weekday-${weekdayIndex}`);
        weekdayRowElement.appendChild(labelElement);
    }
}

function renderCalendar()
{
    currentMonthLabelElement.textContent = `${currentYear}년 ${MONTH_NAMES_KO[currentMonth]}`;

    const firstOfMonthDate = new Date(currentYear, currentMonth, 1);
    const startOffset = columnIndexForWeekday(firstOfMonthDate.getDay());
    const gridStartDate = new Date(currentYear, currentMonth, 1 - startOffset);

    const lastOfMonthDate = new Date(currentYear, currentMonth + 1, 0);
    const totalDaysInGrid = startOffset + lastOfMonthDate.getDate();
    const rowCount = Math.ceil(totalDaysInGrid / 7);
    const totalCellCount = rowCount * 7;

    const visibleEventList = filterVisibleEvents(currentMonthEventList);
    const eventsByDateMap = groupEventsByDate(visibleEventList);

    calendarGridElement.replaceChildren();
    for (let cellIndex = 0; cellIndex < totalCellCount; cellIndex += 1)
    {
        const cellDate = new Date(gridStartDate.getFullYear(), gridStartDate.getMonth(), gridStartDate.getDate() + cellIndex);
        const isInCurrentMonth = cellDate.getMonth() === currentMonth;
        const cellDateString = formatDateString(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
        const eventListForDate = eventsByDateMap.get(cellDateString) || [];
        const dayCellElement = buildDayCellElement(cellDate, isInCurrentMonth, eventListForDate);
        calendarGridElement.appendChild(dayCellElement);
    }
}

function buildFilterChipElement(filterKey, labelText, swatchColor)
{
    const itemElement = document.createElement("label");
    itemElement.className = "filter-chip";
    const checkboxElement = document.createElement("input");
    checkboxElement.type = "checkbox";
    checkboxElement.checked = hiddenGroupKeySet.has(filterKey) === false;
    checkboxElement.addEventListener("change", () =>
    {
        if (checkboxElement.checked === true)
        {
            hiddenGroupKeySet.delete(filterKey);
        }
        else
        {
            hiddenGroupKeySet.add(filterKey);
        }
        saveHiddenGroupKeySet(hiddenGroupKeySet);
        renderCalendar();
    });
    const swatchElement = document.createElement("span");
    swatchElement.className = "filter-swatch";
    swatchElement.style.backgroundColor = swatchColor;
    const labelElement = document.createElement("span");
    labelElement.className = "filter-label";
    labelElement.textContent = labelText;
    itemElement.appendChild(checkboxElement);
    itemElement.appendChild(swatchElement);
    itemElement.appendChild(labelElement);
    return itemElement;
}

function renderFilterBar()
{
    filterBarElement.replaceChildren();
    for (const groupRecord of currentGroupList)
    {
        const chipElement = buildFilterChipElement(String(groupRecord.id), groupRecord.name, groupRecord.color);
        filterBarElement.appendChild(chipElement);
    }
    const noneChipElement = buildFilterChipElement(NO_GROUP_FILTER_KEY, "그룹 없음", DEFAULT_EVENT_COLOR);
    filterBarElement.appendChild(noneChipElement);
}

function renderEventGroupSelect(selectedGroupId)
{
    eventGroupSelectElement.replaceChildren();
    const noneOptionElement = document.createElement("option");
    noneOptionElement.value = "";
    noneOptionElement.textContent = "(그룹 없음)";
    eventGroupSelectElement.appendChild(noneOptionElement);
    for (const groupRecord of currentGroupList)
    {
        const optionElement = document.createElement("option");
        optionElement.value = String(groupRecord.id);
        optionElement.textContent = groupRecord.name;
        eventGroupSelectElement.appendChild(optionElement);
    }
    if (selectedGroupId === null || selectedGroupId === undefined)
    {
        eventGroupSelectElement.value = "";
    }
    else
    {
        eventGroupSelectElement.value = String(selectedGroupId);
    }
}

function buildGroupListItemElement(groupRecord)
{
    const itemElement = document.createElement("div");
    itemElement.className = "group-list-item";
    const colorInputElement = document.createElement("input");
    colorInputElement.type = "color";
    colorInputElement.value = groupRecord.color;
    const nameInputElement = document.createElement("input");
    nameInputElement.type = "text";
    nameInputElement.maxLength = 50;
    nameInputElement.value = groupRecord.name;
    const saveButtonElement = document.createElement("button");
    saveButtonElement.type = "button";
    saveButtonElement.textContent = "저장";
    saveButtonElement.addEventListener("click", async () =>
    {
        const nameValue = nameInputElement.value.trim();
        const colorValue = colorInputElement.value;
        if (nameValue.length === 0)
        {
            window.alert("그룹 이름을 입력하세요.");
            return;
        }
        try
        {
            await updateGroup(groupRecord.id, { name: nameValue, color: colorValue });
            await reloadGroupsAndCalendar();
        }
        catch (errorObject)
        {
            window.alert(errorObject.message);
        }
    });
    const deleteButtonElement = document.createElement("button");
    deleteButtonElement.type = "button";
    deleteButtonElement.className = "danger";
    deleteButtonElement.textContent = "삭제";
    deleteButtonElement.addEventListener("click", async () =>
    {
        const userConfirmation = window.confirm(`"${groupRecord.name}" 그룹을 삭제하시겠습니까? 이 그룹의 일정들은 "그룹 없음" 으로 남습니다.`);
        if (userConfirmation === false)
        {
            return;
        }
        try
        {
            await deleteGroup(groupRecord.id);
            hiddenGroupKeySet.delete(String(groupRecord.id));
            saveHiddenGroupKeySet(hiddenGroupKeySet);
            await reloadGroupsAndCalendar();
        }
        catch (errorObject)
        {
            window.alert(errorObject.message);
        }
    });
    itemElement.appendChild(colorInputElement);
    itemElement.appendChild(nameInputElement);
    itemElement.appendChild(saveButtonElement);
    itemElement.appendChild(deleteButtonElement);
    return itemElement;
}

function renderGroupListInDialog()
{
    groupListContainerElement.replaceChildren();
    if (currentGroupList.length === 0)
    {
        const emptyElement = document.createElement("div");
        emptyElement.className = "group-empty";
        emptyElement.textContent = "등록된 그룹이 없습니다.";
        groupListContainerElement.appendChild(emptyElement);
        return;
    }
    for (const groupRecord of currentGroupList)
    {
        const itemElement = buildGroupListItemElement(groupRecord);
        groupListContainerElement.appendChild(itemElement);
    }
}

function refreshWeekStartButtonLabel()
{
    const labelText = currentWeekStart === 1 ? "주 시작: 월" : "주 시작: 일";
    weekStartToggleButtonElement.textContent = labelText;
}

async function reloadGroups()
{
    const fetchedGroupList = await fetchGroups();
    currentGroupList = fetchedGroupList;
    currentGroupMap = new Map();
    for (const groupRecord of fetchedGroupList)
    {
        currentGroupMap.set(groupRecord.id, groupRecord);
    }
}

async function reloadCurrentMonth()
{
    try
    {
        const fetchedEventList = await fetchMonthEvents(currentYear, currentMonth + 1);
        currentMonthEventList = fetchedEventList;
        renderCalendar();
    }
    catch (errorObject)
    {
        console.error(errorObject);
        currentMonthEventList = [];
        renderCalendar();
        window.alert(errorObject.message);
    }
}

async function reloadGroupsAndCalendar()
{
    try
    {
        await reloadGroups();
        renderFilterBar();
        renderGroupListInDialog();
        await reloadCurrentMonth();
    }
    catch (errorObject)
    {
        window.alert(errorObject.message);
    }
}

function moveMonth(deltaMonths)
{
    const newDate = new Date(currentYear, currentMonth + deltaMonths, 1);
    currentYear = newDate.getFullYear();
    currentMonth = newDate.getMonth();
    reloadCurrentMonth();
}

function moveToToday()
{
    const nowDate = new Date();
    currentYear = nowDate.getFullYear();
    currentMonth = nowDate.getMonth();
    reloadCurrentMonth();
}

function toggleWeekStart()
{
    currentWeekStart = currentWeekStart === 1 ? 0 : 1;
    saveWeekStart(currentWeekStart);
    refreshWeekStartButtonLabel();
    renderWeekdayRow();
    renderCalendar();
}

function applyAllDayInputState()
{
    const isAllDayChecked = eventAllDayInputElement.checked;
    eventStartTimeInputElement.disabled = isAllDayChecked;
    eventEndTimeInputElement.disabled = isAllDayChecked;
}

function openEventDialogForCreate(dateString)
{
    editingEventId = null;
    eventDialogTitleElement.textContent = "일정 추가";
    eventDateInputElement.value = dateString;
    eventAllDayInputElement.checked = false;
    eventStartTimeInputElement.value = "09:00";
    eventEndTimeInputElement.value = "10:00";
    eventTitleInputElement.value = "";
    renderEventGroupSelect(null);
    applyAllDayInputState();
    eventDeleteButtonElement.classList.add("hidden");
    eventDialogBackdropElement.classList.remove("hidden");
    eventTitleInputElement.focus();
}

function openEventDialogForEdit(eventRecord)
{
    editingEventId = eventRecord.id;
    eventDialogTitleElement.textContent = "일정 편집";
    eventDateInputElement.value = eventRecord.date;
    const isAllDay = eventRecord.all_day === true;
    eventAllDayInputElement.checked = isAllDay;
    eventStartTimeInputElement.value = isAllDay ? "09:00" : (eventRecord.start_time || "09:00");
    eventEndTimeInputElement.value = isAllDay ? "10:00" : (eventRecord.end_time || "10:00");
    eventTitleInputElement.value = eventRecord.title;
    renderEventGroupSelect(eventRecord.group_id);
    applyAllDayInputState();
    eventDeleteButtonElement.classList.remove("hidden");
    eventDialogBackdropElement.classList.remove("hidden");
    eventTitleInputElement.focus();
    eventTitleInputElement.select();
}

function closeEventDialog()
{
    eventDialogBackdropElement.classList.add("hidden");
    editingEventId = null;
}

function buildEventPayload()
{
    const titleValue = eventTitleInputElement.value.trim();
    const dateValue = eventDateInputElement.value;
    const isAllDayChecked = eventAllDayInputElement.checked;
    const groupSelectionValue = eventGroupSelectElement.value;
    const groupIdValue = groupSelectionValue === "" ? null : Number.parseInt(groupSelectionValue, 10);
    if (titleValue.length === 0)
    {
        return { error: "제목을 입력하세요." };
    }
    if (dateValue.length === 0)
    {
        return { error: "날짜를 선택하세요." };
    }
    if (isAllDayChecked === true)
    {
        return {
            payload: {
                title: titleValue,
                date: dateValue,
                all_day: true,
                start_time: null,
                end_time: null,
                group_id: groupIdValue
            }
        };
    }
    const startTimeValue = eventStartTimeInputElement.value;
    const endTimeValue = eventEndTimeInputElement.value;
    if (startTimeValue.length === 0)
    {
        return { error: "시작 시간을 입력하세요." };
    }
    if (endTimeValue.length === 0)
    {
        return { error: "종료 시간을 입력하세요." };
    }
    if (endTimeValue < startTimeValue)
    {
        return { error: "종료 시간은 시작 시간보다 빠를 수 없습니다." };
    }
    return {
        payload: {
            title: titleValue,
            date: dateValue,
            all_day: false,
            start_time: startTimeValue,
            end_time: endTimeValue,
            group_id: groupIdValue
        }
    };
}

async function handleSaveClick()
{
    const buildResult = buildEventPayload();
    if (buildResult.error !== undefined)
    {
        window.alert(buildResult.error);
        return;
    }
    try
    {
        if (editingEventId === null)
        {
            await createEvent(buildResult.payload);
        }
        else
        {
            await updateEvent(editingEventId, buildResult.payload);
        }
        closeEventDialog();
        await reloadCurrentMonth();
    }
    catch (errorObject)
    {
        window.alert(errorObject.message);
    }
}

async function handleDeleteClick()
{
    if (editingEventId === null)
    {
        return;
    }
    const userConfirmation = window.confirm("이 일정을 삭제하시겠습니까?");
    if (userConfirmation === false)
    {
        return;
    }
    try
    {
        await deleteEvent(editingEventId);
        closeEventDialog();
        await reloadCurrentMonth();
    }
    catch (errorObject)
    {
        window.alert(errorObject.message);
    }
}

function openGroupDialog()
{
    renderGroupListInDialog();
    newGroupNameInputElement.value = "";
    newGroupColorInputElement.value = "#2f6fed";
    groupDialogBackdropElement.classList.remove("hidden");
    newGroupNameInputElement.focus();
}

function closeGroupDialog()
{
    groupDialogBackdropElement.classList.add("hidden");
}

async function handleAddGroupClick()
{
    const nameValue = newGroupNameInputElement.value.trim();
    const colorValue = newGroupColorInputElement.value;
    if (nameValue.length === 0)
    {
        window.alert("그룹 이름을 입력하세요.");
        return;
    }
    try
    {
        await createGroup({ name: nameValue, color: colorValue });
        newGroupNameInputElement.value = "";
        newGroupColorInputElement.value = "#2f6fed";
        await reloadGroupsAndCalendar();
        newGroupNameInputElement.focus();
    }
    catch (errorObject)
    {
        window.alert(errorObject.message);
    }
}

function bindEventListeners()
{
    previousMonthButtonElement.addEventListener("click", () => moveMonth(-1));
    nextMonthButtonElement.addEventListener("click", () => moveMonth(1));
    todayButtonElement.addEventListener("click", () => moveToToday());
    weekStartToggleButtonElement.addEventListener("click", () => toggleWeekStart());
    manageGroupsButtonElement.addEventListener("click", () => openGroupDialog());

    eventAllDayInputElement.addEventListener("change", () => applyAllDayInputState());
    eventCancelButtonElement.addEventListener("click", () => closeEventDialog());
    eventSaveButtonElement.addEventListener("click", () => handleSaveClick());
    eventDeleteButtonElement.addEventListener("click", () => handleDeleteClick());
    eventDialogBackdropElement.addEventListener("click", (clickEvent) =>
    {
        if (clickEvent.target === eventDialogBackdropElement)
        {
            closeEventDialog();
        }
    });

    addGroupButtonElement.addEventListener("click", () => handleAddGroupClick());
    groupDialogCloseButtonElement.addEventListener("click", () => closeGroupDialog());
    groupDialogBackdropElement.addEventListener("click", (clickEvent) =>
    {
        if (clickEvent.target === groupDialogBackdropElement)
        {
            closeGroupDialog();
        }
    });
    newGroupNameInputElement.addEventListener("keydown", (keyboardEvent) =>
    {
        if (keyboardEvent.key === "Enter")
        {
            handleAddGroupClick();
        }
    });

    document.addEventListener("keydown", (keyboardEvent) =>
    {
        const isEventDialogOpen = eventDialogBackdropElement.classList.contains("hidden") === false;
        const isGroupDialogOpen = groupDialogBackdropElement.classList.contains("hidden") === false;
        if (keyboardEvent.key === "Escape")
        {
            if (isEventDialogOpen === true)
            {
                closeEventDialog();
            }
            else if (isGroupDialogOpen === true)
            {
                closeGroupDialog();
            }
            return;
        }
        if (keyboardEvent.key === "Enter" && isEventDialogOpen === true)
        {
            const activeElement = document.activeElement;
            if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "SELECT"))
            {
                handleSaveClick();
            }
        }
    });
}

async function initialize()
{
    currentWeekStart = loadWeekStart();
    hiddenGroupKeySet = loadHiddenGroupKeySet();
    refreshWeekStartButtonLabel();
    const nowDate = new Date();
    currentYear = nowDate.getFullYear();
    currentMonth = nowDate.getMonth();
    bindEventListeners();
    renderWeekdayRow();
    try
    {
        await reloadGroups();
        renderFilterBar();
    }
    catch (errorObject)
    {
        console.error(errorObject);
    }
    await reloadCurrentMonth();
}

initialize();
