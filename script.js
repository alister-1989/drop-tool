(() => {
  const STORAGE_KEY = "dropToolItems_v2";

  const $ = (id) => document.getElementById(id);

  // --- Form ---
  const nameInput = $("itemName");
  const rateSelect = $("rateSelect");
  const addBtn = $("addBtn");
  const exportBtn = $("exportBtn");
  const importBtn = $("importBtn");
  const msg = $("msg");

  // --- Sort ---
  const sortNameBtn = $("sortNameBtn");
  const sortRateBtn = $("sortRateBtn");

  // --- Table ---
  const tbody = $("itemsBody");

  // --- Backup/Restore modal ---
  const modal = $("modal");
  const modalDesc = $("modalDesc");
  const modalText = $("modalText");
  const modalCancel = $("modalCancel");
  const modalOk = $("modalOk");

  // --- Rate change modal (must exist in index.html) ---
  const rateModal = document.getElementById("rateModal");
  const rateModalSelect = document.getElementById("rateModalSelect");
  const rateModalCancel = document.getElementById("rateModalCancel");
  const rateModalOk = document.getElementById("rateModalOk");

  // Allowed denoms
  const RATE_DENOMS = [8, 16, 32, 64, 128, 256, 4096];

  let items = loadItems();
  let sortNameAsc = true;
  let sortRateAsc = true;

  // for rate modal
  let currentRateItemId = null;

  // --- Service Worker register (HTTPS only) ---
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  function showMsg(text, isError = true) {
    msg.textContent = text || "";
    msg.style.color = isError ? "var(--danger)" : "var(--primary)";
    if (text) {
      setTimeout(() => {
        if (msg.textContent === text) msg.textContent = "";
      }, 4000);
    }
  }

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((x) => ({
          id: String(x.id || cryptoRandomId()),
          name: String(x.name || ""),
          denom: Number(x.denom || 0),
          count: Number(x.count || 0),
          dropped: Boolean(x.dropped || false),
          createdAt: Number(x.createdAt || Date.now()),
        }))
        .filter((x) => x.name && x.denom > 0);
    } catch {
      return [];
    }
  }

  function saveItems() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function cryptoRandomId() {
    return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function formatRate(denom) {
    return `1/${denom}`;
  }

  // B: n回引いて1回以上当たる確率
  function probAtLeastOncePercent(denom, n) {
    const p = 1 / denom;
    const prob = 1 - Math.pow(1 - p, n);
    return prob * 100;
  }

  function formatPercent(x) {
    if (!isFinite(x)) return "-";
    if (x === 0) return "0.000%";
    if (x < 0.01) return x.toFixed(4) + "%";
    if (x < 1) return x.toFixed(3) + "%";
    return x.toFixed(2) + "%";
  }

  // --- Rate modal helpers ---
  function openRateModal(item) {
    if (!rateModal || !rateModalSelect || !rateModalCancel || !rateModalOk) {
      showMsg("rateModal が見つかりません。index.html に率変更モーダルを追加してください。");
      return;
    }
    currentRateItemId = item.id;
    rateModalSelect.value = String(item.denom);
    rateModal.classList.remove("hidden");
  }

  function closeRateModal() {
    if (!rateModal) return;
    rateModal.classList.add("hidden");
    currentRateItemId = null;
  }

  if (rateModalCancel) {
    rateModalCancel.addEventListener("click", closeRateModal);
  }

  if (rateModalOk) {
    rateModalOk.addEventListener("click", () => {
      if (!currentRateItemId) return;

      const item = items.find((x) => x.id === currentRateItemId);
      if (!item) {
        closeRateModal();
        return;
      }

      const denom = Number(rateModalSelect.value);
      if (!RATE_DENOMS.includes(denom)) {
        showMsg("不正なドロップ率です。");
        return;
      }

      item.denom = denom; // count/dropped は保持
      saveItems();
      render();
      closeRateModal();
      showMsg(`ドロップ率を 1/${denom} に変更しました。`, false);
    });
  }

  // --- render ---
  function render() {
    tbody.innerHTML = "";

    if (items.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.style.color = "var(--muted)";
      td.style.padding = "14px 10px";
      td.textContent = "まだ項目がありません。上のフォームから登録してください。";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const item of items) {
      const tr = document.createElement("tr");
      if (item.dropped) tr.classList.add("done-row");

      // name
      const tdName = document.createElement("td");
      tdName.textContent = item.name;
      tr.appendChild(tdName);

      // rate (clickable)
      const tdRate = document.createElement("td");
      const rateBtn = document.createElement("button");
      rateBtn.type = "button";
      rateBtn.className = "badge";
      rateBtn.style.border = "1px solid var(--border)";
      rateBtn.style.cursor = "pointer";
      rateBtn.style.background = "#eef2ff";
      rateBtn.title = "クリックしてドロップ率を変更";
      rateBtn.textContent = formatRate(item.denom);
      rateBtn.addEventListener("click", () => openRateModal(item));
      tdRate.appendChild(rateBtn);
      tr.appendChild(tdRate);

      // count
      const tdCount = document.createElement("td");
      tdCount.textContent = String(item.count);
      tr.appendChild(tdCount);

      // prob
      const tdProb = document.createElement("td");
      const pct = probAtLeastOncePercent(item.denom, item.count);
      tdProb.textContent = formatPercent(pct);
      tr.appendChild(tdProb);

      // ops
      const tdOps = document.createElement("td");
      const ops = document.createElement("div");
      ops.className = "ops";

      if (!item.dropped) {
        const plusBtn = document.createElement("button");
        plusBtn.className = "btn small";
        plusBtn.type = "button";
        plusBtn.textContent = "+1";
        plusBtn.addEventListener("click", () => {
          item.count += 1;
          saveItems();
          render();
        });
        ops.appendChild(plusBtn);

        const dropBtn = document.createElement("button");
        dropBtn.className = "btn small primary";
        dropBtn.type = "button";
        dropBtn.textContent = "ドロップ";
        dropBtn.addEventListener("click", () => {
          if (!confirm("ドロップ済みにしますか？（+1は消えます）")) return;
          item.dropped = true;
          saveItems();
          render();
        });
        ops.appendChild(dropBtn);
      }

      const delBtn = document.createElement("button");
      delBtn.className = "btn small danger";
      delBtn.type = "button";
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", () => {
        if (!confirm("この項目を削除してもよろしいですか？")) return;
        items = items.filter((x) => x.id !== item.id);
        saveItems();
        render();
      });
      ops.appendChild(delBtn);

      tdOps.appendChild(ops);
      tr.appendChild(tdOps);

      tbody.appendChild(tr);
    }
  }

  // --- add item ---
  function addItem() {
    const name = (nameInput.value || "").trim();
    const denom = Number(rateSelect.value || 0);

    if (!name) {
      showMsg("名前を入力してください。");
      return;
    }
    if (!denom) {
      showMsg("ドロップ率を選択してください。");
      return;
    }

    const newItem = {
      id: cryptoRandomId(),
      name,
      denom,
      count: 0,
      dropped: false,
      createdAt: Date.now(),
    };

    items.push(newItem);
    saveItems();
    render();

    nameInput.value = "";
    rateSelect.value = "";
    showMsg("登録しました。", false);
  }

  // --- sort ---
  function sortByName() {
    items.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "ja");
      return sortNameAsc ? cmp : -cmp;
    });
    sortNameAsc = !sortNameAsc;
    saveItems();
    render();
  }

  function sortByRate() {
    items.sort((a, b) => {
      const cmp = a.denom - b.denom;
      return sortRateAsc ? cmp : -cmp;
    });
    sortRateAsc = !sortRateAsc;
    saveItems();
    render();
  }

  // --- backup/restore modal ---
  function openModal(mode) {
    modal.classList.remove("hidden");
    modalText.value = "";
    modalOk.dataset.mode = mode;

    if (mode === "export") {
      modalDesc.textContent = "下の内容を全部コピーして保存してください（メモ帳など）。";
      modalText.value = JSON.stringify({ version: 1, exportedAt: Date.now(), items }, null, 2);
      modalText.focus();
      modalText.select();
      modalOk.textContent = "コピーした";
    } else {
      modalDesc.textContent = "バックアップ文字列(JSON)を貼り付けてOKを押してください。";
      modalOk.textContent = "復元";
      modalText.focus();
    }
  }

  function closeModal() {
    modal.classList.add("hidden");
    modalText.value = "";
  }

  function doModalOk() {
    const mode = modalOk.dataset.mode;

    if (mode === "export") {
      closeModal();
      showMsg("バックアップを保存しました。", false);
      return;
    }

    const text = (modalText.value || "").trim();
    if (!text) {
      showMsg("復元する文字列(JSON)を貼り付けてください。");
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const imported = parsed.items;
      if (!Array.isArray(imported)) throw new Error("itemsがありません");

      const normalized = imported
        .map((x) => ({
          id: String(x.id || cryptoRandomId()),
          name: String(x.name || ""),
          denom: Number(x.denom || 0),
          count: Number(x.count || 0),
          dropped: Boolean(x.dropped || false),
          createdAt: Number(x.createdAt || Date.now()),
        }))
        .filter((x) => x.name && x.denom > 0);

      if (normalized.length === 0) {
        showMsg("復元データに有効な項目がありません。");
        return;
      }

      items = normalized;
      saveItems();
      render();
      closeModal();
      showMsg("復元しました。", false);
    } catch {
      showMsg("復元に失敗しました。文字列が壊れていないか確認してください。");
    }
  }

  // --- events ---
  addBtn.addEventListener("click", addItem);
  sortNameBtn.addEventListener("click", sortByName);
  sortRateBtn.addEventListener("click", sortByRate);

  exportBtn.addEventListener("click", () => openModal("export"));
  importBtn.addEventListener("click", () => openModal("import"));
  modalCancel.addEventListener("click", closeModal);
  modalOk.addEventListener("click", doModalOk);

  // Enter key => add
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
  });

  // initial
  render();
})();
