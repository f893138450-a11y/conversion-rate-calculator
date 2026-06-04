const STORAGE_KEY = "conversion-rate-history-v1";
const MAX_HISTORY = 50;

const form = document.querySelector("#calculator-form");
const numeratorInput = document.querySelector("#numerator");
const denominatorInput = document.querySelector("#denominator");
const calculateBtn = document.querySelector("#calculate-btn");
const resetBtn = document.querySelector("#reset-btn");
const clearHistoryBtn = document.querySelector("#clear-history-btn");
const resultValue = document.querySelector("#result-value");
const resultHint = document.querySelector("#result-hint");
const resultBoard = document.querySelector(".result-board");
const historyTitle = document.querySelector("#history-title");
const historyList = document.querySelector("#history-list");
const emptyState = document.querySelector("#empty-state");
const template = document.querySelector("#history-item-template");
const numeratorError = document.querySelector("#numerator-error");
const denominatorError = document.querySelector("#denominator-error");

let historyRecords = loadHistory();
let activeSwipeId = null;
let longPressTimer = null;

renderHistory();
validateForm();

numeratorInput.addEventListener("input", () => validateForm());
denominatorInput.addEventListener("input", () => validateForm());

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!validateForm()) {
    return;
  }

  const numerator = Number(numeratorInput.value.trim());
  const denominator = Number(denominatorInput.value.trim());
  const rate = calculateRate(numerator, denominator);

  if (rate === null) {
    setFieldError(denominatorInput, denominatorError, "分母不能为0");
    return;
  }

  clearFieldError(denominatorInput, denominatorError);
  showResult(rate);

  const nextRecord = {
    id: crypto.randomUUID(),
    numerator: normalizeNumberString(numeratorInput.value),
    denominator: normalizeNumberString(denominatorInput.value),
    rate: formatRate(rate),
    timestamp: new Date().toISOString(),
    note: ""
  };

  saveRecord(nextRecord);
});

resetBtn.addEventListener("click", () => {
  numeratorInput.value = "";
  denominatorInput.value = "";
  clearFieldError(numeratorInput, numeratorError);
  clearFieldError(denominatorInput, denominatorError);
  resetResultBoard();
  validateForm();
  numeratorInput.focus();
});

clearHistoryBtn.addEventListener("click", () => {
  if (!historyRecords.length) {
    window.alert("当前没有可清空的历史记录。");
    return;
  }

  const confirmed = window.confirm("确定要清空所有计算历史吗？此操作不可撤销");

  if (!confirmed) {
    return;
  }

  historyRecords = [];
  persistHistory();
  renderHistory();
});

function validateForm() {
  const numeratorState = validateNumericInput(numeratorInput, numeratorError);
  const denominatorState = validateNumericInput(denominatorInput, denominatorError, { rejectZero: true });
  const isValid = numeratorState.valid && denominatorState.valid;

  calculateBtn.disabled = !isValid;
  return isValid;
}

function validateNumericInput(input, errorNode, options = {}) {
  const raw = input.value.trim();

  if (!raw) {
    clearFieldError(input, errorNode);
    return { valid: false };
  }

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    setFieldError(input, errorNode, "仅支持正整数或浮点数");
    return { valid: false };
  }

  const value = Number(raw);

  if (Number.isNaN(value) || value < 0) {
    setFieldError(input, errorNode, "仅支持正整数或浮点数");
    return { valid: false };
  }

  if (options.rejectZero && value === 0) {
    setFieldError(input, errorNode, "分母不能为0");
    return { valid: false };
  }

  clearFieldError(input, errorNode);
  return { valid: true, value };
}

function setFieldError(input, errorNode, message) {
  input.classList.add("invalid");
  errorNode.textContent = message;
}

function clearFieldError(input, errorNode) {
  input.classList.remove("invalid");
  errorNode.textContent = "";
}

function calculateRate(numerator, denominator) {
  if (denominator === 0) {
    return null;
  }

  return (numerator / denominator) * 100;
}

function formatRate(rate) {
  return `${rate.toFixed(2)}%`;
}

function showResult(rate) {
  resultValue.textContent = formatRate(rate);
  resultHint.textContent = "结果已同步保存到历史记录，可点击下方记录回填复用。";
  resultBoard.classList.remove("fresh");

  window.requestAnimationFrame(() => {
    resultBoard.classList.add("fresh");
  });
}

function resetResultBoard() {
  resultBoard.classList.remove("fresh");
  resultValue.textContent = "--";
  resultHint.textContent = "输入分子与分母后，点击“开始计算”查看结果。";
}

function saveRecord(record) {
  const latest = historyRecords[0];

  if (
    latest &&
    latest.numerator === record.numerator &&
    latest.denominator === record.denominator
  ) {
    historyRecords[0] = {
      ...latest,
      rate: record.rate,
      timestamp: record.timestamp
    };
  } else {
    historyRecords.unshift(record);
    historyRecords = historyRecords.slice(0, MAX_HISTORY);
  }

  persistHistory();
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";
  historyTitle.textContent = `历史计算记录（共 ${historyRecords.length} 条）`;
  emptyState.hidden = historyRecords.length > 0;
  clearHistoryBtn.disabled = historyRecords.length === 0;

  historyRecords.forEach((record) => {
    const fragment = template.content.cloneNode(true);
    const item = fragment.querySelector(".history-item");
    const content = fragment.querySelector(".history-content");
    const deleteBtn = fragment.querySelector(".delete-swipe-btn");
    const timeNode = fragment.querySelector(".history-time");
    const rateNode = fragment.querySelector(".history-rate");
    const formulaNode = fragment.querySelector(".history-formula");
    const noteBtn = fragment.querySelector(".history-note");

    item.dataset.id = record.id;
    timeNode.textContent = formatTimestamp(record.timestamp);
    rateNode.textContent = record.rate;
    formulaNode.textContent = `${record.numerator} / ${record.denominator}`;
    noteBtn.textContent = record.note ? `备注：${record.note}` : "添加备注";
    noteBtn.classList.toggle("empty", !record.note);

    content.addEventListener("click", (event) => {
      if (event.target.closest(".history-note")) {
        return;
      }

      refillInputs(record);
    });

    noteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      editNote(record.id);
    });

    deleteBtn.addEventListener("click", () => {
      deleteRecord(record.id);
    });

    enableSwipe(content, item, record.id);
    enableLongPress(content, record.id);

    historyList.appendChild(fragment);
  });
}

function refillInputs(record) {
  numeratorInput.value = record.numerator;
  denominatorInput.value = record.denominator;
  resultValue.textContent = record.rate;
  resultHint.textContent = `已回填 ${formatTimestamp(record.timestamp)} 的数据，可直接微调后重新计算。`;
  validateForm();
  numeratorInput.focus();
}

function editNote(recordId) {
  const target = historyRecords.find((item) => item.id === recordId);

  if (!target) {
    return;
  }

  const nextNote = window.prompt("请输入备注标签（例如：618活动、朋友圈广告）", target.note ?? "");

  if (nextNote === null) {
    return;
  }

  target.note = nextNote.trim();
  persistHistory();
  renderHistory();
}

function deleteRecord(recordId) {
  const confirmed = window.confirm("确定删除这条历史记录吗？");

  if (!confirmed) {
    return;
  }

  historyRecords = historyRecords.filter((item) => item.id !== recordId);
  persistHistory();
  renderHistory();
}

function enableSwipe(content, item, recordId) {
  let startX = 0;
  let currentDelta = 0;

  content.addEventListener("touchstart", (event) => {
    closeSwipes(recordId);
    startX = event.touches[0].clientX;
  }, { passive: true });

  content.addEventListener("touchmove", (event) => {
    currentDelta = event.touches[0].clientX - startX;
  }, { passive: true });

  content.addEventListener("touchend", () => {
    if (currentDelta < -50) {
      item.classList.add("swiped");
      activeSwipeId = recordId;
    } else if (currentDelta > 30) {
      item.classList.remove("swiped");
      activeSwipeId = null;
    }

    currentDelta = 0;
  });
}

function enableLongPress(content, recordId) {
  const start = () => {
    clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(() => {
      deleteRecord(recordId);
    }, 650);
  };

  const cancel = () => {
    clearTimeout(longPressTimer);
  };

  content.addEventListener("mousedown", start);
  content.addEventListener("mouseup", cancel);
  content.addEventListener("mouseleave", cancel);
  content.addEventListener("touchstart", start, { passive: true });
  content.addEventListener("touchend", cancel);
  content.addEventListener("touchmove", cancel, { passive: true });
}

function closeSwipes(exceptId = null) {
  if (!activeSwipeId || activeSwipeId === exceptId) {
    return;
  }

  const previous = historyList.querySelector(`.history-item[data-id="${activeSwipeId}"]`);

  if (previous) {
    previous.classList.remove("swiped");
  }

  activeSwipeId = null;
}

function normalizeNumberString(value) {
  const number = Number(value.trim());
  return Number.isInteger(number) ? String(number) : String(number);
}

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function persistHistory() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(historyRecords));
}

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.slice(0, MAX_HISTORY);
  } catch (error) {
    console.error("Failed to load history", error);
    return [];
  }
}
