/**
 * Wires "Download Android App" links to WEBSITE_CRM_PUBLIC_CONFIG.ANDROID_APP_DOWNLOAD_URL.
 * Never invents a URL. Empty / non-HTTPS values leave the control disabled.
 */
(function wireAndroidAppDownload() {
  const config = window.WEBSITE_CRM_PUBLIC_CONFIG || {};
  const url = String(config.ANDROID_APP_DOWNLOAD_URL || "").trim();
  const isHttpsApkUrl = /^https:\/\//i.test(url);

  document.querySelectorAll("[data-android-app-download]").forEach(el => {
    if (!el || String(el.tagName || "").toUpperCase() !== "A") return;

    if (isHttpsApkUrl) {
      el.href = url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.removeAttribute("aria-disabled");
      el.classList.remove("is-disabled");
      el.title = "Download the Website CRM Android APK";
      return;
    }

    el.href = "#";
    el.removeAttribute("target");
    el.removeAttribute("rel");
    el.setAttribute("aria-disabled", "true");
    el.classList.add("is-disabled");
    el.title = "Android APK download URL is not configured yet";
    el.addEventListener("click", event => {
      event.preventDefault();
    });
  });
})();
