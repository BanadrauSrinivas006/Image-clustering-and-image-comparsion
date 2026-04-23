"""
Image Clustering Web Application
=================================
Flask backend with MobileNetV2 feature extraction and multiple clustering algorithms.
"""

import sys
import io
import os
import uuid
import json
import traceback
import numpy as np
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from PIL import Image
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

# ── Fix Windows console encoding ──────────────────────────────────────────────
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ── TensorFlow setup (suppress verbose logs) ─────────────────────────────────
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from tensorflow.keras.models import Model

# ── Flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB max

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "bmp", "webp", "tiff"}

# ── Load MobileNetV2 model (once at startup) ─────────────────────────────────
print("[INFO] Loading MobileNetV2 model...")
_base = MobileNetV2(weights="imagenet", include_top=False, pooling="avg", input_shape=(224, 224, 3))
_base.trainable = False
feature_extractor = _base
print("[OK] MobileNetV2 ready - feature vector size: 1280")


# ── Helpers ───────────────────────────────────────────────────────────────────
def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_features(image_paths: list[str]) -> np.ndarray:
    """Load images, preprocess, and extract feature vectors via MobileNetV2."""
    images = []
    for path in image_paths:
        img = Image.open(path).convert("RGB").resize((224, 224))
        arr = np.array(img, dtype=np.float32)
        arr = preprocess_input(arr)
        images.append(arr)
    batch = np.stack(images, axis=0)
    features = feature_extractor.predict(batch, verbose=0)
    return features  # shape: (N, 1280)


def run_clustering(features: np.ndarray, algorithm: str, n_clusters: int):
    """
    Cluster the feature matrix and return labels + 2‑D coordinates for the scatter plot.
    """
    # Standardise features
    scaler = StandardScaler()
    scaled = scaler.fit_transform(features)

    # PCA → 50‑D for clustering (keep variance, remove noise)
    n_components_cluster = min(50, scaled.shape[0], scaled.shape[1])
    pca_cluster = PCA(n_components=n_components_cluster, random_state=42)
    reduced = pca_cluster.fit_transform(scaled)

    # PCA → 2‑D for visualisation
    n_components_vis = min(2, reduced.shape[1])
    pca_vis = PCA(n_components=n_components_vis, random_state=42)
    coords_2d = pca_vis.fit_transform(reduced)

    # Ensure we always have 2 columns for the scatter plot
    if coords_2d.shape[1] == 1:
        coords_2d = np.hstack([coords_2d, np.zeros((coords_2d.shape[0], 1))])

    # Clustering
    if algorithm == "kmeans":
        k = min(n_clusters, len(features))
        model = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = model.fit_predict(reduced)
    elif algorithm == "dbscan":
        model = DBSCAN(eps=3.0, min_samples=2)
        labels = model.fit_predict(reduced)
    elif algorithm == "agglomerative":
        k = min(n_clusters, len(features))
        model = AgglomerativeClustering(n_clusters=k)
        labels = model.fit_predict(reduced)
    else:
        k = min(n_clusters, len(features))
        model = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = model.fit_predict(reduced)

    # Silhouette score (requires ≥ 2 clusters with ≥ 2 samples each)
    unique_labels = set(labels)
    unique_labels.discard(-1)  # DBSCAN noise
    score = -1.0
    if len(unique_labels) >= 2 and len(labels) > 2:
        try:
            score = float(silhouette_score(reduced, labels))
        except Exception:
            score = -1.0

    return labels.tolist(), coords_2d.tolist(), round(score, 4)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


@app.route("/api/upload", methods=["POST"])
def upload_and_cluster():
    """Accept images, extract features, cluster, and return results."""
    try:
        files = request.files.getlist("images")
        if not files or len(files) == 0:
            return jsonify({"error": "No images uploaded."}), 400

        # Filter valid images
        valid_files = [f for f in files if f and f.filename and allowed_file(f.filename)]
        if len(valid_files) < 2:
            return jsonify({"error": "Please upload at least 2 valid images (png, jpg, jpeg, gif, bmp, webp)."}), 400

        # Read parameters
        algorithm = request.form.get("algorithm", "kmeans").lower()
        try:
            n_clusters = int(request.form.get("n_clusters", 3))
        except ValueError:
            n_clusters = 3
        n_clusters = max(2, min(n_clusters, 10))

        # Save files
        saved_paths = []
        saved_names = []
        for f in valid_files:
            ext = f.filename.rsplit(".", 1)[1].lower()
            unique_name = f"{uuid.uuid4().hex}.{ext}"
            save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)
            f.save(save_path)
            saved_paths.append(save_path)
            saved_names.append(unique_name)

        # ML pipeline
        print(f"[INFO] Extracting features from {len(saved_paths)} images...")
        features = extract_features(saved_paths)
        print(f"[INFO] Clustering with {algorithm} (k={n_clusters})...")
        labels, coords, silhouette = run_clustering(features, algorithm, n_clusters)

        # Build response
        clusters = {}
        scatter_points = []
        for i, (name, label, coord) in enumerate(zip(saved_names, labels, coords)):
            cluster_key = str(label)
            if cluster_key not in clusters:
                clusters[cluster_key] = []
            clusters[cluster_key].append({
                "filename": name,
                "url": f"/uploads/{name}",
            })
            scatter_points.append({
                "x": coord[0],
                "y": coord[1],
                "cluster": label,
                "filename": name,
                "url": f"/uploads/{name}",
            })

        return jsonify({
            "success": True,
            "total_images": len(saved_names),
            "algorithm": algorithm,
            "n_clusters_requested": n_clusters,
            "n_clusters_found": len(clusters),
            "silhouette_score": silhouette,
            "clusters": clusters,
            "scatter": scatter_points,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n[START] Image Clustering server starting at http://localhost:5000\n")
    app.run(debug=True, host="0.0.0.0", port=5000)
