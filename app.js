(function () {
  "use strict";

  var API_HOST = "https://comp-sync.webapp.163.com";
  var MODE_LABELS = {
    "-127": "全部模式",
    noban: "常规模式",
    ban_3: "禁选模式",
    ban_4: "迷雾模式",
  };

  var state = {
    mode: localStorage.getItem("mode") || "-127",
    role: "全",
    sortKey: "win_rate",
    sortDir: "desc",
    heroesById: {},
    picPaths: {},
    rows: [],
    stats: {},
  };

  var els = {
    dateChip: document.getElementById("dateChip"),
    modeTrigger: document.getElementById("modeTrigger"),
    modeMenu: document.getElementById("modeMenu"),
    modeLabel: document.querySelector("#modeTrigger .mode-label"),
    roleTabs: document.getElementById("roleTabs"),
    resultCount: document.getElementById("resultCount"),
    rankList: document.getElementById("rankList"),
    statAvgWin: document.getElementById("statAvgWin"),
    statTopWin: document.getElementById("statTopWin"),
    statTopHero: document.getElementById("statTopHero"),
    detailDrawer: document.getElementById("detailDrawer"),
    drawerAvatar: document.getElementById("drawerAvatar"),
    drawerRoles: document.getElementById("drawerRoles"),
    drawerTitle: document.getElementById("drawerTitle"),
    drawerLane: document.getElementById("drawerLane"),
    drawerMetrics: document.getElementById("drawerMetrics"),
    drawerAttrs: document.getElementById("drawerAttrs"),
    drawerTags: document.getElementById("drawerTags"),
    drawerBio: document.getElementById("drawerBio"),
  };

  /* ---------- JSONP ---------- */

  var jsonpSeq = 0;

  function jsonp(url, params) {
    return new Promise(function (resolve, reject) {
      var cbName = "__moba_jsonp_" + Date.now() + "_" + jsonpSeq++;
      var script = document.createElement("script");
      var cleaned = false;
      var timer = null;

      var query = [];
      var merged = Object.assign({ callback: cbName }, params || {});
      Object.keys(merged).forEach(function (k) {
        if (merged[k] === undefined || merged[k] === null) return;
        query.push(encodeURIComponent(k) + "=" + encodeURIComponent(merged[k]));
      });

      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(timer);
        try {
          delete window[cbName];
        } catch (e) {
          window[cbName] = undefined;
        }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = function (payload) {
        cleanup();
        resolve(payload);
      };

      script.onerror = function () {
        cleanup();
        reject(new Error("JSONP request failed: " + url));
      };

      timer = setTimeout(function () {
        cleanup();
        reject(new Error("JSONP timeout: " + url));
      }, 15000);

      script.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + query.join("&");
      document.head.appendChild(script);
    });
  }

  /* ---------- data ---------- */

  function loadBase() {
    var heroP = jsonp(API_HOST + "/g78_hero/free_convey").then(function (res) {
      var data = (res && res.data) || {};
      var map = {};
      Object.keys(data).forEach(function (name) {
        var h = data[name];
        if (h && h["式神ID"] != null) map[String(h["式神ID"])] = h;
      });
      state.heroesById = map;
      return map;
    });

    var picsP = jsonp(API_HOST + "/g78_pics/api").then(function (res) {
      state.picPaths = (res && res.path_dict) || {};
      return state.picPaths;
    });

    return Promise.all([heroP, picsP]);
  }

  function loadRank(mode) {
    return jsonp(API_HOST + "/g78_op_stat_hero_rank_new_v2/free_convey", {
      hero_type: "",
      limit: 200,
      mode: mode,
    }).then(function (res) {
      var list = (res && res.data) || [];
      var rows = [];
      var dateid = "";
      var winSum = 0;
      var topWin = 0;
      var topHero = null;

      list.forEach(function (r) {
        var hero = state.heroesById[String(r.hero_id)];
        if (!hero) return;
        if (!dateid) dateid = r.dateid || "";

        var iconPath =
          hero["式神方头像_新"] || hero["式神方头像"] || hero["式神圆头像_新"] || hero["式神圆头像"];
        var avatar = state.picPaths[iconPath] || iconPath || "";

        var row = {
          hero_id: String(r.hero_id),
          name: hero["式神名称"],
          roles: hero["式神定位"] || [],
          lane: hero["推荐分路"] || "",
          tags: hero["式神标签"] || "",
          bio: (hero["式神传记"] || "").replace(/#r/g, "\n"),
          attrs: hero["式神基础属性"] || {},
          avatar: avatar,
          win_rate: Number(r.win_rate) || 0,
          battle_rate: Number(r.battle_rate) || 0,
          kda: Number(r.kda) || 0,
          avg_kill_cnt: Number(r.avg_kill_cnt) || 0,
          dateid: r.dateid || "",
        };

        winSum += row.win_rate;
        if (row.win_rate > topWin) {
          topWin = row.win_rate;
          topHero = row;
        }
        rows.push(row);
      });

      state.rows = rows;
      state.stats = {
        dateid: dateid,
        total: rows.length,
        avgWin: rows.length ? winSum / rows.length : 0,
        topWin: topWin,
        topHero: topHero,
      };
      return state;
    });
  }

  /* ---------- helpers ---------- */

  function pct(n, digits) {
    var d = digits == null ? 2 : digits;
    return (n * 100).toFixed(d) + "%";
  }

  function winTone(rate) {
    if (rate >= 0.52) return "high";
    if (rate >= 0.49) return "mid";
    return "low";
  }

  function winBarPct(rate) {
    var n = Math.round(Math.min(100, Math.max(0, (rate - 0.4) * (100 / 0.2))));
    return String(n);
  }

  function formatAttr(key, val) {
    if (typeof val !== "number") return String(val);
    if (Number.isInteger(val)) return String(val);
    return val.toFixed(2);
  }

  function showLoading() {
    els.rankList.innerHTML = '<div class="loading-state">加载中…</div>';
    els.resultCount.textContent = "加载中…";
  }

  function showError(err) {
    els.rankList.innerHTML =
      '<div class="error-state">加载失败：' +
      escapeHtml(String((err && err.message) || err)) +
      "</div>";
    els.resultCount.textContent = "加载失败";
  }

  /* ---------- derive / render ---------- */

  function filteredSorted() {
    var role = state.role;
    var rows = state.rows.filter(function (r) {
      if (role === "全") return true;
      return (r.roles || []).indexOf(role) >= 0;
    });

    var key = state.sortKey;
    var dir = state.sortDir === "asc" ? 1 : -1;
    rows = rows.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (av === bv) return a.name.localeCompare(b.name, "zh-Hans-CN");
      return (av - bv) * dir;
    });
    return rows;
  }

  function renderStats() {
    var s = state.stats;
    els.statAvgWin.textContent = s.avgWin ? pct(s.avgWin) : "—";
    els.statTopWin.textContent = s.topHero ? pct(s.topWin) : "—";
    els.statTopHero.textContent = s.topHero ? s.topHero.name : "—";
    els.dateChip.textContent = s.dateid || "—";
  }

  function sortIndicator() {
    document.querySelectorAll(".col-sort").forEach(function (btn) {
      btn.classList.remove("is-asc", "is-desc");
      if (btn.getAttribute("data-sort") === state.sortKey) {
        btn.classList.add(state.sortDir === "asc" ? "is-asc" : "is-desc");
      }
    });
  }

  function renderList() {
    var rows = filteredSorted();
    sortIndicator();
    els.resultCount.textContent = "共 " + rows.length + " 位";

    if (!rows.length) {
      els.rankList.innerHTML = '<div class="empty-state">当前筛选下暂无数据</div>';
      return;
    }

    var html = rows
      .map(function (r, i) {
        var rank = i + 1;
        var tone = winTone(r.win_rate);
        var roleChips = (r.roles || [])
          .map(function (x) {
            return '<span class="role-pill">' + x + "</span>";
          })
          .join("");
        var subBits = [];
        if (r.lane) subBits.push(r.lane + "路");
        if (r.tags) subBits.push(r.tags.split("/").slice(0, 2).join(" · "));

        var avatarHtml = r.avatar
          ? '<img class="hero-avatar" src="' +
            escapeAttr(r.avatar) +
            '" alt="' +
            escapeAttr(r.name) +
            '" width="40" height="40" decoding="async" loading="lazy" />'
          : '<div class="hero-avatar is-fallback" role="img" aria-label="' +
            escapeAttr(r.name) +
            '">' +
            escapeHtml((r.name || "?").slice(0, 1)) +
            "</div>";

        return (
          '<article class="rank-row" tabindex="0" data-id="' +
          escapeAttr(r.hero_id) +
          '" data-rank="' +
          rank +
          '">' +
          '<span class="col-rank">' +
          padRank(rank) +
          "</span>" +
          '<div class="col-hero">' +
          avatarHtml +
          '<div class="hero-meta">' +
          '<p class="hero-name">' +
          escapeHtml(r.name) +
          "</p>" +
          '<p class="hero-sub">' +
          roleChips +
          escapeHtml(subBits.join(" / ") || "式神") +
          "</p>" +
          "</div></div>" +
          '<div class="metric-cell win-wrap" title="胜率">' +
          '<span class="win-value">' +
          pct(r.win_rate) +
          "</span>" +
          '<span class="win-bar tone-' +
          tone +
          '" aria-hidden="true"><i data-w="' +
          winBarPct(r.win_rate) +
          '"></i></span>' +
          "</div>" +
          '<div class="metric-cell" title="登场率">' +
          pct(r.battle_rate) +
          "</div>" +
          '<div class="metric-cell" title="KDA">' +
          r.kda.toFixed(1) +
          "</div>" +
          '<div class="metric-cell" title="场均击杀">' +
          r.avg_kill_cnt.toFixed(2) +
          "</div>" +
          '<div class="mobile-metrics">' +
          '<div class="mm"><span>胜率</span><b class="' +
          tone +
          '">' +
          pct(r.win_rate, 1) +
          "</b></div>" +
          '<div class="mm"><span>登场</span><b>' +
          pct(r.battle_rate, 1) +
          "</b></div>" +
          '<div class="mm"><span>KDA</span><b>' +
          r.kda.toFixed(1) +
          "</b></div>" +
          '<div class="mm"><span>击杀</span><b>' +
          r.avg_kill_cnt.toFixed(1) +
          "</b></div>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");

    els.rankList.innerHTML = html;
  }

  function padRank(n) {
    if (n < 10) return "0" + n;
    if (n < 100) return String(n);
    return String(n);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  /* ---------- detail drawer ---------- */

  function openDetail(heroId) {
    var row = state.rows.find(function (r) {
      return r.hero_id === String(heroId);
    });
    if (!row) return;

    els.drawerAvatar.src = row.avatar || "";
    els.drawerAvatar.alt = row.name + "头像";
    els.drawerTitle.textContent = row.name;
    els.drawerRoles.textContent = (row.roles || []).join(" · ") || "式神";
    els.drawerLane.textContent = row.lane ? "推荐路线 · " + row.lane + "路" : "式神详情";
    els.drawerTags.textContent = row.tags ? "标签：" + row.tags : "";

    var tone = winTone(row.win_rate);
    els.drawerMetrics.innerHTML = [
      card("胜率", pct(row.win_rate), tone),
      card("登场率", pct(row.battle_rate), ""),
      card("KDA", row.kda.toFixed(1), ""),
      card("场均击杀", row.avg_kill_cnt.toFixed(2), ""),
    ].join("");

    var attrOrder = [
      "生命值",
      "物理伤害",
      "攻击速度",
      "护甲",
      "魔抗",
      "移动速度",
      "魔法上限",
      "生命恢复",
    ];
    var attrs = row.attrs || {};
    var keys = attrOrder.filter(function (k) {
      return attrs[k] != null;
    });
    Object.keys(attrs).forEach(function (k) {
      if (keys.indexOf(k) < 0) keys.push(k);
    });
    keys = keys.slice(0, 8);

    els.drawerAttrs.innerHTML = keys
      .map(function (k) {
        return "<li><span>" + escapeHtml(k) + "</span><b>" + formatAttr(k, attrs[k]) + "</b></li>";
      })
      .join("");

    els.drawerBio.textContent = row.bio || "暂无传记数据。";
    els.detailDrawer.hidden = false;
    document.body.classList.add("is-locked");
  }

  function card(label, value, tone) {
    var cls = tone ? ' class="' + tone + '"' : "";
    return (
      '<div class="m-card"><span>' +
      escapeHtml(label) +
      "</span><strong" +
      cls +
      ">" +
      escapeHtml(value) +
      "</strong></div>"
    );
  }

  function closeDetail() {
    els.detailDrawer.hidden = true;
    document.body.classList.remove("is-locked");
  }

  /* ---------- events ---------- */

  function bindEvents() {
    els.modeTrigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = els.modeMenu.hidden;
      els.modeMenu.hidden = !open;
      els.modeTrigger.setAttribute("aria-expanded", open ? "true" : "false");
    });

    els.modeMenu.addEventListener("click", function (e) {
      var li = e.target.closest("li[data-mode]");
      if (!li) return;
      var mode = li.getAttribute("data-mode");
      setMode(mode);
      els.modeMenu.hidden = true;
      els.modeTrigger.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("click", function () {
      els.modeMenu.hidden = true;
      els.modeTrigger.setAttribute("aria-expanded", "false");
    });

    els.roleTabs.addEventListener("click", function (e) {
      var btn = e.target.closest(".role-tab");
      if (!btn) return;
      state.role = btn.getAttribute("data-role") || "全";
      els.roleTabs.querySelectorAll(".role-tab").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      renderList();
    });

    document.querySelectorAll(".col-sort").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-sort");
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
        } else {
          state.sortKey = key;
          state.sortDir = "desc";
        }
        renderList();
      });
    });

    els.rankList.addEventListener("click", function (e) {
      var row = e.target.closest(".rank-row");
      if (!row) return;
      openDetail(row.getAttribute("data-id"));
    });

    els.rankList.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var row = e.target.closest(".rank-row");
      if (!row) return;
      e.preventDefault();
      openDetail(row.getAttribute("data-id"));
    });

    els.detailDrawer.addEventListener("click", function (e) {
      if (e.target.hasAttribute("data-close")) closeDetail();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !els.detailDrawer.hidden) closeDetail();
    });
  }

  function syncModeLabel() {
    var label = MODE_LABELS[state.mode] || MODE_LABELS["-127"];
    els.modeLabel.textContent = label;
    els.modeMenu.querySelectorAll("li[data-mode]").forEach(function (li) {
      li.classList.toggle("is-active", li.getAttribute("data-mode") === state.mode);
    });
  }

  function setMode(mode) {
    if (!MODE_LABELS[mode]) mode = "-127";
    if (state.mode === mode) {
      syncModeLabel();
      return;
    }
    state.mode = mode;
    localStorage.setItem("mode", mode);
    syncModeLabel();
    showLoading();
    loadRank(mode)
      .then(function () {
        renderStats();
        renderList();
      })
      .catch(showError);
  }

  function boot() {
    syncModeLabel();
    bindEvents();
    showLoading();

    loadBase()
      .then(function () {
        return loadRank(state.mode);
      })
      .then(function () {
        renderStats();
        renderList();
      })
      .catch(showError);
  }

  boot();
})();
