(() => {
  const STORAGE_KEY = "dropToolItems_v3"; // v3に上げる（新仕様）
  const RATE_DENOMS = [8, 16, 32, 64, 128, 256, 4096];

  const $ = (id) => document.getElementById(id);

  // form
  const nameInput = $("itemName");
  const dropRateSelect = $("dropRateSelect");
  const rareRateSelect = $("rareRateSelect");
  const addBtn = $("addBtn");
  const exportBtn = $("exportBtn");
  const importBtn = $("importBtn");
  const msg = $("msg");

  // sort
  const sortNameBtn = $("sortNameBtn");
  const sortDropRateBtn = $("sortDropRateBtn");
  const sortRareRateBtn = $("sortRareRateBtn");

  // table
  const tbody = $("itemsBody");

  // backup/restore modal
  const modal = $("modal");
  const modalDesc = $("modalDesc");
  const modalText = $("modalText");
  const modalCancel = $("modalCancel");
  const modalOk = $("modalOk");

  // rate modal
  const rateModal = $("rateModal");
  const rateModalTitle = $("rateModalTitle");
  const rateModalDesc = $("rateModalDesc");
  const rateModalSelect = $("rateModalSelect");
  const rateModalCancel = $("rateModalCancel");
  const rateModalOk = $("rateModalOk");

  let items = loadItems();
  let sortNameAsc = true;
  let sortDropAsc = true;
  let sortRareAsc = true;

  // rate modal state
  let currentRateItemId = null;
  let currentRateKind = null; // "drop" or "rare"

  // Service Worker（GitHub PagesはHTTPSなのでOK）
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  function showMsg(text, isError = true) {
    msg.textContent = text || "";
    msg.style.color = isError ? "var(--danger)" : "var(--primary)";
    if (text) setTimeout(() => { if (msg.textContent === text) msg.textContent = ""; }, 4000);
  }

  function cryptoRandomId() {
    return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function normalizeItem(x) {
    // 旧形式(denom/count/dropped)→ 新形式へ移行
    const id = String(x.id || cryptoRandomId());
    const name = String(x.name || "").trim();
    const count = Number(x.count || 0);
    const createdAt = Number(x.createdAt || Date.now());

    // 旧: denom があれば dropDenom に入れる
    const dropDenom = Number(x.dropDenom || x.denom || 0);
    const rareDenom = Number(x.rareDenom || 0);

    const dropDone = Boolean(x.dropDone || false);
    const rareDone = Boolean(x.rareDone || false);

    // 旧: dropped=true は「両方完了」に近い扱いにする（互換）
    const legacyDropped = Boolean(x.dropped || false);

    const dropAt = (x.dropAt !== undefined && x.dropAt !== null) ? Number(x.dropAt) : null;
    const rareAt = (x.rareAt !== undefined && x.rareAt !== null) ? Number(x.rareAt) : null;

    const fixed = {
      id,
      name,
      dropDenom,
      rareDenom,
      count,
      // 旧droppedなら両方完了扱いにしておく（回数は不明なのでnull）
      dropDone: legacyDropped ? true : dropDone,
      rareDone: legacyDropped ? true : rareDone,
      dropAt: legacyDropped ? (dropAt ?? null) : dropAt,
      rareAt: legacyDropped ? (rareAt ?? null) : rareAt,
      createdAt
    };

    return fixed;
  }

  function loadItems() {
    // v3がなければ、旧キー(v2)から読み込んで移行する
    const rawV3 = localStorage.getItem(STORAGE_KEY);
    if (rawV3) {
      try {
        const parsed = JSON.parse(rawV3);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeItem).filter(isValidItem);
      } catch {
        return [];
      }
    }

    // 旧データ（v2）を拾って移行
    const rawV2 = localStorage.getItem("dropToolItems_v2");
    if (rawV2) {
      try {
        const parsed = JSON.parse(rawV2);
        if (!Array.isArray(parsed)) return [];
        const migrated = parsed.map(normalizeItem).filter(isValidItem);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      } catch {
        return [];
      }
    }

    return [];
  }

  function isValidItem(x) {
    return x.name && Number.isFinite(x.count) && x.dropDenom > 0;
  }

  function saveItems() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function formatRate(denom) {
    return denom > 0 ? `1/${denom}` : "-";
  }

  function probAtLeastOncePercent(denom, n) {
    if (!denom || denom <= 0) return NaN;
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

  function isFullyDone(item) {
    return item.dropDone && item.rareDone;
  }

  // --- Rate modal ---
  function openRateModal(item, kind) {
    currentRateItemId = item.id;
    currentRateKind = kind;

    if (kind === "drop") {
      rateModalTitle.textContent = "ドロップ率変更";
      rateModalDesc.textContent = "この項目のドロップ率を選択してください。";
      rateModalSelect.value = String(item.dropDenom || "");
    } else {
      rateModalTitle.textContent = "レア率変更";
      rateModalDesc.textContent = "この項目のレア率を選択してください。";
      rateModalSelect.value = String(item.rareDenom || "");
    }

    rateModal.classList.remove("hidden");
  }

  function closeRateModal() {
    rateModal.classList.add("hidden");
    currentRateItemId = null;
    currentRateKind = null;
  }

  rateModalCancel.addEventListener("click", closeRateModal);

  rateModalOk.addEventListener("click", () => {
    if (!currentRateItemId || !currentRateKind) return;
    const item = items.find(x => x.id === currentRateItemId);
    if (!item) return;

    const denom = Number(rateModalSelect.value);
    if (!RATE_DENOMS.includes(denom)) {
      showMsg("不正な率です。");
      return;
    }

    if (currentRateKind === "drop") item.dropDenom = denom;
    if (currentRateKind === "rare") item.rareDenom = denom;

    saveItems();
    render();
    closeRateModal();
    showMsg("率を変更しました。", false);
  });

  // --- Render ---
  function render() {
    tbody.innerHTML = "";

    if (items.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.style.color = "var(--muted)";
      td.style.padding = "14px 10px";
      td.textContent = "まだ項目がありません。上のフォームから登録してください。";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const item of items) {
      const tr = document.createElement("tr");
      if (isFullyDone(item)) tr.classList.add("done-row");

      // name
      const tdName = document.createElement("td");
      tdName.textContent = item.name;
      tr.appendChild(tdName);

      // drop rate badge
      const tdDropRate = document.createElement("td");
      const dropBadge = document.createElement("button");
      dropBadge.type = "button";
      dropBadge.className = "badge";
      dropBadge.textContent = formatRate(item.dropDenom);
      dropBadge.title = "クリックしてドロップ率を変更";
      dropBadge.addEventListener("click", () => openRateModal(item, "drop"));
      tdDropRate.appendChild(dropBadge);
      tr.appendChild(tdDropRate);

      // rare rate badge
      const tdRareRate = document.createElement("td");
      const rareBadge = document.createElement("button");
      rareBadge.type = "button";
      rareBadge.className = "badge";
      rareBadge.textContent = item.rareDenom > 0 ? formatRate(item.rareDenom) : "未設定";
      rareBadge.title = "クリックしてレア率を変更";
      rareBadge.addEventListener("click", () => openRateModal(item, "rare"));
      tdRareRate.appendChild(rareBadge);
      tr.appendChild(tdRareRate);

      // count
      const tdCount = document.createElement("td");
      tdCount.textContent = String(item.count);
      tr.appendChild(tdCount);

      // drop prob
      const tdDropProb = document.createElement("td");
      tdDropProb.textContent = formatPercent(probAtLeastOncePercent(item.dropDenom, item.count));
      tr.appendChild(tdDropProb);

      // rare prob
      const tdRareProb = document.createElement("td");
      tdRareProb.textContent = item.rareDenom > 0
        ? formatPercent(probAtLeastOncePercent(item.rareDenom, item.count))
        : "-";
      tr.appendChild(tdRareProb);

      // ops
      const tdOps = document.createElement("td");
      const ops = document.createElement("div");
      ops.className = "ops";

      // 完了記録表示
      const note = document.createElement("div");
      note.className = "note";
      const dropTxt = item.dropDone ? `D:${item.dropAt ?? "?"}` : "D:-";
      const rareTxt = item.rareDone ? `R:${item.rareAt ?? "?"}` : "R:-";
      note.textContent = `${dropTxt} / ${rareTxt}`;
      ops.appendChild(note);

      if (!isFullyDone(item)) {
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

        if (!item.dropDone) {
          const dropBtn = document.createElement("button");
          dropBtn.className = "btn small primary";
          dropBtn.type = "button";
          dropBtn.textContent = "ドロップ";
          dropBtn.addEventListener("click", () => {
            if (!confirm("ドロップ済みにしますか？（現在の回数を記録します）")) return;
            item.dropDone = true;
            item.dropAt = item.count; // 押した時点の回数
            saveItems();
            render();
          });
          ops.appendChild(dropBtn);
        }

        if (!item.rareDone) {
          const rareBtn = document.createElement("button");
          rareBtn.className = "btn small primary";
          rareBtn.type = "button";
          rareBtn.textContent = "レア";
          rareBtn.addEventListener("click", () => {
            if (!confirm("レアドロップ済みにしますか？（現在の回数を記録します）")) return;
            item.rareDone = true;
            item.rareAt = item.count;
            saveItems();
            render();
          });
          ops.appendChild(rareBtn);
        }
      }

      const delBtn = document.createElement("button");
      delBtn.className = "btn small danger";
      delBtn.type = "button";
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", () => {
        if (!confirm("この項目を削除してもよろしいですか？")) return;
        items = items.filter(x => x.id !== item.id);
        saveItems();
        render();
      });
      ops.appendChild(delBtn);

      tdOps.appendChild(ops);
      tr.appendChild(tdOps);

      tbody.appendChild(tr);
    }
  }

  // --- Add item ---
  function addItem() {
    const name = (nameInput.value || "").trim();
    const dropDenom = Number(dropRateSelect.value || 0);
    const rareDenom = Number(rareRateSelect.value || 0);

    if (!name) return showMsg("名前を入力してください。");
    if (!dropDenom) return showMsg("ドロップ率を選択してください。");
    if (!rareDenom) return showMsg("レア率を選択してください。");

    const newItem = {
      id: cryptoRandomId(),
      name,
      dropDenom,
      rareDenom,
      count: 0,
      dropDone: false,
      rareDone: false,
      dropAt: null,
      rareAt: null,
      createdAt: Date.now()
    };

    items.push(newItem);
    saveItems();
    render();

    nameInput.value = "";
    dropRateSelect.value = "";
    rareRateSelect.value = "";
    showMsg("登録しました。", false);
  }

  // --- Sort ---
  function sortByName() {
    items.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "ja");
      return sortNameAsc ? cmp : -cmp;
    });
    sortNameAsc = !sortNameAsc;
    saveItems();
    render();
  }

  function sortByDropRate() {
    items.sort((a, b) => {
      const cmp = (a.dropDenom || 0) - (b.dropDenom || 0);
      return sortDropAsc ? cmp : -cmp;
    });
    sortDropAsc = !sortDropAsc;
    saveItems();
    render();
  }

  function sortByRareRate() {
    items.sort((a, b) => {
      const aa = a.rareDenom || 999999;
      const bb = b.rareDenom || 999999;
      const cmp = aa - bb;
      return sortRareAsc ? cmp : -cmp;
    });
    sortRareAsc = !sortRareAsc;
    saveItems();
    render();
  }

  // --- Backup/Restore ---
  function openModal(mode) {
    modal.classList.remove("hidden");
    modalText.value = "";
    modalOk.dataset.mode = mode;

    if (mode === "export") {
      modalDesc.textContent = "下の内容を全部コピーして保存してください（メモ帳など）。";
      modalText.value = JSON.stringify({ version: 3, exportedAt: Date.now(), items }, null, 2);
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
    if (!text) return showMsg("復元する文字列(JSON)を貼り付けてください。");

    try {
      const parsed = JSON.parse(text);
      const imported = parsed.items;
      if (!Array.isArray(imported)) throw new Error("itemsがありません");

      const normalized = imported.map(normalizeItem).filter(isValidItem);
      if (normalized.length === 0) return showMsg("復元データに有効な項目がありません。");

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
  sortDropRateBtn.addEventListener("click", sortByDropRate);
  sortRareRateBtn.addEventListener("click", sortByRareRate);

  exportBtn.addEventListener("click", () => openModal("export"));
  importBtn.addEventListener("click", () => openModal("import"));
  modalCancel.addEventListener("click", closeModal);
  modalOk.addEventListener("click", doModalOk);

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
  });

  render();
})();
