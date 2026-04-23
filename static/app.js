/**
 * Image Clustering — Frontend Application Logic
 */

document.addEventListener("DOMContentLoaded", function () {
  console.log("[app.js] DOM loaded, initializing...");

  // ── State ──────────────────────────────────────────────────────────────────
  let selectedFiles = [];

  // ── DOM Elements ───────────────────────────────────────────────────────────
  const fileInput = document.getElementById("file-input");
  const uploadZone = document.getElementById("upload-zone");
  const previewSection = document.getElementById("preview-section");
  const previewGrid = document.getElementById("preview-grid");
  const previewCount = document.getElementById("preview-count");
  const algorithmSelect = document.getElementById("algorithm-select");
  const clusterSlider = document.getElementById("cluster-slider");
  const clusterValue = document.getElementById("cluster-value");
  const clusterBtn = document.getElementById("cluster-btn");
  const loadingOverlay = document.getElementById("loading-overlay");
  const loadingStep = document.getElementById("loading-step");
  const resultsSection = document.getElementById("results-section");
  const scatterCanvas = document.getElementById("scatter-canvas");
  const scatterTooltip = document.getElementById("scatter-tooltip");
  const clustersContainer = document.getElementById("clusters-container");
  const imageModal = document.getElementById("image-modal");
  const modalImage = document.getElementById("modal-image");

  const statTotal = document.getElementById("stat-total");
  const statClusters = document.getElementById("stat-clusters");
  const statAlgo = document.getElementById("stat-algo");
  const statSilhouette = document.getElementById("stat-silhouette");
  const silhouetteFill = document.getElementById("silhouette-fill");

  // ── Cluster colors ─────────────────────────────────────────────────────────
  const CLUSTER_COLORS = [
    "#6366f1", "#f43f5e", "#22c55e", "#f59e0b",
    "#06b6d4", "#ec4899", "#14b8a6", "#f97316",
    "#8b5cf6", "#64748b",
  ];

  // ── Verify elements ────────────────────────────────────────────────────────
  if (!clusterBtn) { console.error("cluster-btn not found!"); return; }
  if (!fileInput) { console.error("file-input not found!"); return; }
  if (!uploadZone) { console.error("upload-zone not found!"); return; }
  console.log("[app.js] All elements found, binding events...");

  // ── Upload Zone Events ─────────────────────────────────────────────────────
  uploadZone.addEventListener("click", function (e) {
    if (e.target.closest(".browse-btn") || e.target.classList.contains("browse-btn")) {
      return; // let browse button handler handle it
    }
    console.log("[app.js] Upload zone clicked");
    fileInput.click();
  });

  var browseBtn = document.getElementById("browse-btn");
  if (browseBtn) {
    browseBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log("[app.js] Browse button clicked");
      fileInput.click();
    });
  }

  fileInput.addEventListener("change", function (e) {
    console.log("[app.js] Files selected:", e.target.files.length);
    addFiles(Array.from(e.target.files));
    fileInput.value = "";
  });

  // Drag & Drop
  uploadZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.add("drag-over");
  });

  uploadZone.addEventListener("dragleave", function (e) {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.remove("drag-over");
  });

  uploadZone.addEventListener("drop", function (e) {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.remove("drag-over");
    var files = Array.from(e.dataTransfer.files).filter(function (f) {
      return f.type.startsWith("image/");
    });
    console.log("[app.js] Dropped files:", files.length);
    addFiles(files);
  });

  // ── File Management ────────────────────────────────────────────────────────
  function addFiles(files) {
    var imageFiles = files.filter(function (f) { return f.type.startsWith("image/"); });
    for (var i = 0; i < imageFiles.length; i++) {
      selectedFiles.push(imageFiles[i]);
    }
    console.log("[app.js] Total selected files:", selectedFiles.length);
    renderPreview();
  }

  function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderPreview();
  }

  function renderPreview() {
    if (selectedFiles.length === 0) {
      previewSection.classList.remove("visible");
      console.log("[app.js] No files selected");
      return;
    }

    previewSection.classList.add("visible");
    console.log("[app.js] Files:", selectedFiles.length);
    previewCount.textContent = selectedFiles.length + " image" + (selectedFiles.length !== 1 ? "s" : "");

    previewGrid.innerHTML = "";
    selectedFiles.forEach(function (file, idx) {
      var thumb = document.createElement("div");
      thumb.className = "preview-thumb";

      var img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.alt = file.name;

      var btn = document.createElement("button");
      btn.className = "remove-btn";
      btn.innerHTML = "&#10005;";
      btn.title = "Remove";
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        removeFile(idx);
      });

      thumb.appendChild(img);
      thumb.appendChild(btn);
      previewGrid.appendChild(thumb);
    });
  }

  // ── Cluster Slider ─────────────────────────────────────────────────────────
  if (clusterSlider && clusterValue) {
    clusterSlider.addEventListener("input", function () {
      clusterValue.textContent = clusterSlider.value;
    });
  }

  if (algorithmSelect && clusterSlider) {
    algorithmSelect.addEventListener("change", function () {
      var isDBSCAN = algorithmSelect.value === "dbscan";
      clusterSlider.parentElement.parentElement.style.opacity = isDBSCAN ? "0.4" : "1";
      clusterSlider.disabled = isDBSCAN;
    });
  }

  // ── Cluster Button ─────────────────────────────────────────────────────────
  clusterBtn.addEventListener("click", function () {
    console.log("[app.js] Cluster button clicked! Files:", selectedFiles.length);

    if (selectedFiles.length < 2) {
      alert("Please upload at least 2 images first!");
      return;
    }

    var formData = new FormData();
    for (var i = 0; i < selectedFiles.length; i++) {
      formData.append("images", selectedFiles[i]);
    }
    formData.append("algorithm", algorithmSelect.value);
    formData.append("n_clusters", clusterSlider.value);

    // Show loading
    showLoading("Uploading images...");

    fetch("/api/upload", {
      method: "POST",
      body: formData,
    })
      .then(function (response) {
        updateLoadingStep("Processing response...");
        if (!response.ok) {
          return response.json().then(function (data) {
            throw new Error(data.error || "Server error " + response.status);
          });
        }
        return response.json();
      })
      .then(function (data) {
        console.log("[app.js] Response received:", data);
        updateLoadingStep("Rendering results...");
        setTimeout(function () {
          hideLoading();
          displayResults(data);
        }, 400);
      })
      .catch(function (err) {
        console.error("[app.js] Error:", err);
        hideLoading();
        alert("Error: " + err.message);
      });
  });

  // ── Loading ────────────────────────────────────────────────────────────────
  function showLoading(msg) {
    if (loadingStep) loadingStep.textContent = msg || "";
    if (loadingOverlay) loadingOverlay.classList.add("active");
  }

  function updateLoadingStep(msg) {
    if (loadingStep) loadingStep.textContent = msg;
  }

  function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.remove("active");
  }

  // ── Display Results ────────────────────────────────────────────────────────
  function displayResults(data) {
    resultsSection.classList.add("visible");
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

    statTotal.textContent = data.total_images;
    statClusters.textContent = data.n_clusters_found;
    statAlgo.textContent = data.algorithm.toUpperCase();

    if (data.silhouette_score >= 0) {
      statSilhouette.textContent = data.silhouette_score.toFixed(3);
      var pct = ((data.silhouette_score + 1) / 2) * 100;
      silhouetteFill.style.width = pct + "%";
    } else {
      statSilhouette.textContent = "N/A";
      silhouetteFill.style.width = "0%";
    }

    drawScatter(data.scatter);
    renderClusters(data.clusters);
  }

  // ── Scatter Plot (Canvas) ──────────────────────────────────────────────────
  var scatterData = [];

  function drawScatter(points) {
    scatterData = points;
    var container = scatterCanvas.parentElement;
    var rect = container.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;

    scatterCanvas.width = rect.width * dpr;
    scatterCanvas.height = rect.height * dpr;
    scatterCanvas.style.width = rect.width + "px";
    scatterCanvas.style.height = rect.height + "px";

    var ctx = scatterCanvas.getContext("2d");
    ctx.scale(dpr, dpr);

    var width = rect.width;
    var height = rect.height;
    var padding = 40;

    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (var i = 0; i <= 10; i++) {
      var x = padding + (i / 10) * (width - 2 * padding);
      var y = padding + (i / 10) * (height - 2 * padding);
      ctx.beginPath(); ctx.moveTo(x, padding); ctx.lineTo(x, height - padding); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();
    }

    if (points.length === 0) return;

    var xs = points.map(function (p) { return p.x; });
    var ys = points.map(function (p) { return p.y; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var rangeX = maxX - minX || 1;
    var rangeY = maxY - minY || 1;

    function scaleX(v) { return padding + ((v - minX) / rangeX) * (width - 2 * padding); }
    function scaleY(v) { return height - padding - ((v - minY) / rangeY) * (height - 2 * padding); }

    points.forEach(function (p) {
      var cx = scaleX(p.x);
      var cy = scaleY(p.y);
      var color = CLUSTER_COLORS[((p.cluster % CLUSTER_COLORS.length) + CLUSTER_COLORS.length) % CLUSTER_COLORS.length];

      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = color + "30"; ctx.fill();

      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
    });

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PCA Component 1", width / 2, height - 8);
    ctx.save();
    ctx.translate(12, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("PCA Component 2", 0, 0);
    ctx.restore();
  }

  // Scatter tooltip
  if (scatterCanvas && scatterTooltip) {
    scatterCanvas.addEventListener("mousemove", function (e) {
      if (scatterData.length === 0) return;
      var rect = scatterCanvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var width = rect.width, height = rect.height, padding = 40;

      var xs = scatterData.map(function (p) { return p.x; });
      var ys = scatterData.map(function (p) { return p.y; });
      var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
      var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      var rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;

      var closest = null, closestDist = Infinity;
      scatterData.forEach(function (p) {
        var cx = padding + ((p.x - minX) / rangeX) * (width - 2 * padding);
        var cy = height - padding - ((p.y - minY) / rangeY) * (height - 2 * padding);
        var dist = Math.sqrt(Math.pow(mx - cx, 2) + Math.pow(my - cy, 2));
        if (dist < closestDist && dist < 30) {
          closestDist = dist;
          closest = { x: p.x, y: p.y, cluster: p.cluster, url: p.url, cx: cx, cy: cy };
        }
      });

      if (closest) {
        scatterTooltip.style.display = "block";
        scatterTooltip.style.left = (closest.cx + 16) + "px";
        scatterTooltip.style.top = (closest.cy - 48) + "px";
        scatterTooltip.innerHTML = '<img src="' + closest.url + '" alt=""><div class="tip-label">Cluster ' + closest.cluster + '</div>';
      } else {
        scatterTooltip.style.display = "none";
      }
    });

    scatterCanvas.addEventListener("mouseleave", function () {
      scatterTooltip.style.display = "none";
    });
  }

  window.addEventListener("resize", function () {
    if (scatterData.length > 0) drawScatter(scatterData);
  });

  // ── Render Cluster Groups ──────────────────────────────────────────────────
  function renderClusters(clusters) {
    clustersContainer.innerHTML = "";

    var sortedKeys = Object.keys(clusters).sort(function (a, b) {
      if (a === "-1") return 1;
      if (b === "-1") return -1;
      return parseInt(a) - parseInt(b);
    });

    sortedKeys.forEach(function (key, index) {
      var images = clusters[key];
      var colorIndex = key === "-1" ? CLUSTER_COLORS.length - 1 : parseInt(key) % CLUSTER_COLORS.length;
      var color = CLUSTER_COLORS[colorIndex];
      var label = key === "-1" ? "Noise / Outliers" : "Cluster " + (parseInt(key) + 1);

      var group = document.createElement("div");
      group.className = "cluster-group glass-card";
      group.style.animationDelay = (index * 0.1) + "s";

      group.innerHTML =
        '<div class="cluster-header">' +
        '<span class="cluster-dot" style="background:' + color + '; color:' + color + '"></span>' +
        '<h4>' + label + '</h4>' +
        '<span class="cluster-count">' + images.length + ' image' + (images.length !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '<div class="cluster-images"></div>';

      clustersContainer.appendChild(group);

      var imgContainer = group.querySelector(".cluster-images");
      images.forEach(function (img) {
        var card = document.createElement("div");
        card.className = "cluster-img-card";
        card.style.borderColor = color + "40";
        card.innerHTML = '<img src="' + img.url + '" alt="' + img.filename + '" loading="lazy">';
        card.addEventListener("click", function () { openModal(img.url); });
        imgContainer.appendChild(card);
      });
    });
  }

  // ── Image Modal ────────────────────────────────────────────────────────────
  function openModal(url) {
    if (modalImage) modalImage.src = url;
    if (imageModal) imageModal.classList.add("active");
  }

  if (imageModal) {
    imageModal.addEventListener("click", function () {
      imageModal.classList.remove("active");
      if (modalImage) modalImage.src = "";
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && imageModal && imageModal.classList.contains("active")) {
      imageModal.classList.remove("active");
      if (modalImage) modalImage.src = "";
    }
  });

  console.log("[app.js] Initialization complete!");
});
