const config = window.APP_CONFIG || {};

const configured =
  config.SUPABASE_URL &&
  config.SUPABASE_ANON_KEY &&
  !config.SUPABASE_URL.startsWith("YOUR_") &&
  !config.SUPABASE_ANON_KEY.startsWith("YOUR_");

const db = configured
  ? supabase.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_ANON_KEY
    )
  : null;

const $ = (id) => document.getElementById(id);

const money = (value) =>
  "NT$ " + Number(value || 0).toLocaleString("zh-TW");

$("date").value = new Date().toISOString().slice(0, 10);
let editingId = null;
async function render() {
  if (!db) {
    $("loginMessage").textContent =
      "尚未設定 Supabase，稍後我們會完成連線。";
    return;
  }

  const {
    data: { session },
  } = await db.auth.getSession();

  $("loginSection").classList.toggle("hidden", !!session);
  $("dashboard").classList.toggle("hidden", !session);
  $("logoutBtn").classList.toggle("hidden", !session);

  if (session) {
    await loadTransactions();
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!db) {
    $("loginMessage").textContent =
      "尚未設定 Supabase。";
    return;
  }

  $("loginMessage").textContent = "登入中…";

  const { error } =
    await db.auth.signInWithPassword({
      email: $("email").value,
      password: $("password").value,
    });

  if (error) {
    $("loginMessage").textContent = error.message;
    return;
  }

  $("loginMessage").textContent = "";
  await render();
});

$("logoutBtn").addEventListener("click", async () => {
  if (!db) return;

  await db.auth.signOut();
  await render();
});

$("refreshBtn").addEventListener("click", async () => {
  await loadTransactions();
});

$("transactionForm").addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    if (!db) return;

    const {
      data: { user },
    } = await db.auth.getUser();

    if (!user) return;
const { data: member, error: memberError } = await db
  .from("household_members")
  .select("household_id")
  .eq("user_id", user.id)
  .single();

if (memberError || !member) {
  $("transactionMessage").textContent =
    memberError?.message || "找不到家庭資料";
  return;
}
    const formData = new FormData(event.target);

    const transaction = {
      user_id: user.id,
      household_id: member.household_id,
      type: formData.get("type"),
      amount: Number($("amount").value),
      category: $("category").value.trim(),
      transaction_date: $("date").value,
      note: $("note").value.trim() || null,
    };

    $("transactionMessage").textContent =
      "儲存中…";

    let query = db.from("transactions");

if (editingId) {
  query = query.update(transaction).eq("id", editingId);
} else {
  query = query.insert(transaction);
}

const { error } = await query;

    if (error) {
      $("transactionMessage").textContent =
        error.message;
      return;
    }

    $("transactionMessage").textContent =
      "已儲存";

    $("amount").value = "";
    $("note").value = "";
    editingId = null;
    await loadTransactions();
  }
);

async function loadTransactions() {
  if (!db) return;

  const now = new Date();

  const firstDay =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data, error } = await db
    .from("transactions")
    .select("*")
    .gte("transaction_date", firstDay)
    .order("transaction_date", {
      ascending: false,
    })
    .limit(100);

  if (error) {
    $("transactions").innerHTML =
      `<p class="muted">${escapeHtml(error.message)}</p>`;
    return;
  }

  let income = 0;
  let expense = 0;

  (data || []).forEach((item) => {
    if (item.type === "income") {
      income += Number(item.amount);
    } else {
      expense += Number(item.amount);
    }
  });

  $("income").textContent = money(income);
  $("expense").textContent = money(expense);
  $("balance").textContent =
    money(income - expense);

  if (!data || data.length === 0) {
    $("transactions").innerHTML =
      '<p class="muted">尚無資料</p>';
    return;
  }

  $("transactions").innerHTML = data
    .map(
      (item) => `
        <div class="transaction-row" data-id="${item.id}" data-type="${item.type}" data-amount="${item.amount}" data-category="${escapeHtml(item.category)}" data-date="${item.transaction_date}" data-note="${escapeHtml(item.note || "")}">
          <div>
            <strong>
              ${categoryEmoji(item.category)} ${escapeHtml(item.category)}
            </strong>

            <p>
              ${item.transaction_date}
              ${
                item.note
                  ? " · " + escapeHtml(item.note)
                  : ""
              }
            </p>
          </div>

          <div class="transaction-amount">
            ${item.type === "income" ? "+" : "−"}
            ${money(item.amount)}
            <button class="delete-btn" data-id="${item.id}">刪除</button>
          </div>
        </div>
      `
    )
    .join("");
}$("transactions").addEventListener("click", async (event) => {
  const row = event.target.closest(".transaction-row");
  if (!row) return;

  const deleteButton = event.target.closest(".delete-btn");

  if (!deleteButton) {
    editingId = row.dataset.id;
    $("transactionForm").querySelector('button[type="submit"]').textContent = "更新紀錄";
    $("amount").value = row.dataset.amount;
    $("category").value = row.dataset.category;
    $("date").value = row.dataset.date;
    $("note").value = row.dataset.note || "";

    const typeInput = document.querySelector(
      `input[name="type"][value="${row.dataset.type}"]`
    );

    if (typeInput) typeInput.checked = true;

    $("transactionForm").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    return;
  }

  const ok = confirm("確定要刪除這筆紀錄嗎？");
  if (!ok) return;

  const { error } = await db
    .from("transactions")
    .delete()
    .eq("id", row.dataset.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  await loadTransactions();
});
function categoryEmoji(category) {
  const icons = {
    "餐飲": "🍜",
    "交通": "🚗",
    "購物": "🛍️",
    "家庭": "🏠",
    "育兒": "👶",
    "房貸": "🏡",
    "水電": "💡",
    "保險": "🛡️",
    "旅遊": "✈️",
    "娛樂": "🎮",
    "薪資": "💰",
    "獎金": "🎁",
    "投資": "📈",
    "其他": "📦"
  };

  return icons[category] || "📌";
}
function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]
  );
}

if (db) {
  db.auth.onAuthStateChange(() => {
    render();
  });
}

render();
