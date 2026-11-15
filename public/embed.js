/*
 * 스케치북트래블 "내 여행 코스 만들기" 붙이기 — 카페24 자사몰(skcbook.com)용.
 *  ① 페이지 안에 넣기:  <iframe id="sketch-plan" src="https://(앱 주소)/plan?embed=1"></iframe> + 이 스크립트
 *     → 코스 화면이 알려 주는 높이로 iframe 높이를 맞춘다 (스크롤이 두 번 생기지 않게)
 *  ② 떠 있는 버튼:  <script src="https://(앱 주소)/embed.js" data-mode="button" data-label="✈ 내 여행 코스 만들기"></script>
 *     → 모든 페이지 오른쪽 아래 버튼, 누르면 코스 화면이 팝업으로 열린다
 * 다른 사이트에는 서버가 iframe 표시를 막는다 (skcbook.com·카페24 미리보기만 허용).
 */
(function () {
  var me = document.currentScript;
  if (!me) return;
  var origin = new URL(me.src).origin;
  var mode = me.getAttribute("data-mode") || "frame";
  var color = me.getAttribute("data-color") || "#4f46e5";
  var label = me.getAttribute("data-label") || "✈ 내 여행 코스 만들기";

  // 코스 화면이 보내는 높이 → 그 iframe 높이
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || e.data.type !== "semitour-plan-height") return;
    var frames = document.querySelectorAll('iframe[src^="' + origin + '/plan"]');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source && !frames[i].hasAttribute("data-popup")) frames[i].style.height = Math.max(600, Number(e.data.height) || 0) + "px";
    }
  });

  if (mode !== "button") return;

  function open() {
    var wrap = document.createElement("div");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "내 여행 코스 만들기");
    wrap.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center";
    var box = document.createElement("div");
    box.style.cssText = "position:relative;width:min(720px,100vw);height:min(92vh,100dvh);background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.25)";
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "닫기");
    close.textContent = "×";
    close.style.cssText = "position:absolute;top:6px;right:10px;z-index:1;border:0;background:#fff;font-size:24px;line-height:1;cursor:pointer;color:#475569";
    var frame = document.createElement("iframe");
    frame.src = origin + "/plan?embed=1";
    frame.title = "내 여행 코스 만들기";
    frame.setAttribute("data-popup", "1");
    frame.setAttribute("allow", "clipboard-write");
    frame.style.cssText = "width:100%;height:100%;border:0";
    function shut() {
      document.body.removeChild(wrap);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(ev) {
      if (ev.key === "Escape") shut();
    }
    close.onclick = shut;
    wrap.onclick = function (ev) {
      if (ev.target === wrap) shut();
    };
    document.addEventListener("keydown", onKey);
    box.appendChild(close);
    box.appendChild(frame);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
  }

  function addButton() {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483645;border:0;border-radius:999px;padding:12px 18px;font:600 14px/1.2 sans-serif;color:#fff;background:" + color + ";box-shadow:0 6px 18px rgba(0,0,0,.2);cursor:pointer";
    b.onclick = open;
    document.body.appendChild(b);
  }
  if (document.body) addButton();
  else document.addEventListener("DOMContentLoaded", addButton);
})();
