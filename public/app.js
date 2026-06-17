(function () {
  const MOOD_COLORS = {
    1: '#ef4444',
    2: '#f97316',
    3: '#eab308',
    4: '#3b82f6',
    5: '#22c55e'
  };

  const MOOD_LABELS = {
    1: '很差',
    2: '一般',
    3: '还行',
    4: '不错',
    5: '超棒'
  };

  let map;
  let markers = {};
  let currentMood = 3;
  let pendingLatLng = null;
  let currentDetailId = null;
  let footprintsCache = [];
  let pendingFiles = [];
  let lightboxImages = [];
  let lightboxIndex = 0;

  function init() {
    initMap();
    bindEvents();
    loadFootprints();
  }

  function initMap() {
    map = L.map('map', {
      center: [35.86, 104.19],
      zoom: 5,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    map.on('click', onMapClick);
  }

  function onMapClick(e) {
    pendingLatLng = e.latlng;
    openAddModal();
  }

  function openAddModal() {
    var modal = document.getElementById('add-modal');
    modal.classList.remove('hidden');
    document.getElementById('fp-name').value = '';
    document.getElementById('fp-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('fp-feeling').value = '';
    pendingFiles = [];
    renderUploadPreview();
    setMoodRating(3);
    document.getElementById('fp-name').focus();
  }

  function closeAddModal() {
    document.getElementById('add-modal').classList.add('hidden');
    pendingLatLng = null;
    pendingFiles = [];
    document.getElementById('image-input').value = '';
  }

  function setMoodRating(value) {
    currentMood = value;
    var stars = document.querySelectorAll('#star-rating span');
    stars.forEach(function (star) {
      var v = parseInt(star.getAttribute('data-value'), 10);
      if (v <= value) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });
  }

  function bindEvents() {
    document.querySelectorAll('#star-rating span').forEach(function (star) {
      star.addEventListener('click', function () {
        setMoodRating(parseInt(star.getAttribute('data-value'), 10));
      });
    });

    document.getElementById('add-cancel').addEventListener('click', closeAddModal);

    document.querySelector('.modal-backdrop').addEventListener('click', closeAddModal);

    document.getElementById('add-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitFootprint();
    });

    document.getElementById('timeline-toggle').addEventListener('click', function () {
      document.getElementById('timeline-drawer').classList.remove('closed');
    });

    document.getElementById('timeline-close').addEventListener('click', function () {
      document.getElementById('timeline-drawer').classList.add('closed');
    });

    document.getElementById('detail-close').addEventListener('click', closeDetailPopup);

    document.getElementById('detail-delete').addEventListener('click', function () {
      if (currentDetailId != null) {
        deleteFootprint(currentDetailId);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeAddModal();
        closeDetailPopup();
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        lightboxPrev();
      } else if (e.key === 'ArrowRight') {
        lightboxNext();
      }
    });

    setupUploadArea('upload-area', 'image-input', function (files) {
      pendingFiles = pendingFiles.concat(Array.from(files));
      renderUploadPreview();
    });

    setupUploadArea('detail-upload-area', 'detail-image-input', function (files) {
      if (currentDetailId != null) {
        uploadImages(currentDetailId, Array.from(files)).then(function () {
          refreshDetailImages();
          loadTimeline();
        });
      }
    });

    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    document.getElementById('lightbox-prev').addEventListener('click', lightboxPrev);
    document.getElementById('lightbox-next').addEventListener('click', lightboxNext);
    document.getElementById('lightbox-delete').addEventListener('click', function () {
      deleteCurrentLightboxImage();
    });

    document.getElementById('lightbox').addEventListener('click', function (e) {
      if (e.target.id === 'lightbox') {
        closeLightbox();
      }
    });
  }

  function setupUploadArea(areaId, inputId, onFiles) {
    var area = document.getElementById(areaId);
    var input = document.getElementById(inputId);
    if (!area || !input) return;

    area.addEventListener('click', function (e) {
      if (e.target.closest('.preview-remove')) return;
      input.click();
    });

    input.addEventListener('change', function (e) {
      if (e.target.files && e.target.files.length > 0) {
        onFiles(e.target.files);
        input.value = '';
      }
    });

    ['dragenter', 'dragover'].forEach(function (evt) {
      area.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        area.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(function (evt) {
      area.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        area.classList.remove('dragover');
      });
    });

    area.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        var imgFiles = Array.from(e.dataTransfer.files).filter(function (f) {
          return f.type.startsWith('image/');
        });
        if (imgFiles.length > 0) {
          onFiles(imgFiles);
        }
      }
    });
  }

  function renderUploadPreview() {
    var container = document.getElementById('upload-preview');
    var hint = document.querySelector('#upload-area .upload-hint');
    if (!container) return;

    if (pendingFiles.length === 0) {
      container.innerHTML = '';
      if (hint) hint.style.display = '';
      return;
    }
    if (hint) hint.style.display = 'none';

    var html = '';
    pendingFiles.forEach(function (file, idx) {
      var url = URL.createObjectURL(file);
      html += '<div class="preview-item">' +
        '<img src="' + url + '" alt="preview" loading="lazy">' +
        '<button type="button" class="preview-remove" data-idx="' + idx + '">&times;</button>' +
        '</div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.preview-remove').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        pendingFiles.splice(idx, 1);
        renderUploadPreview();
      });
    });
  }

  function submitFootprint() {
    if (!pendingLatLng) return;

    var name = document.getElementById('fp-name').value.trim();
    var date = document.getElementById('fp-date').value;
    var feeling = document.getElementById('fp-feeling').value.trim();

    if (!name || !date) return;

    fetch('/api/footprints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        date: date,
        feeling: feeling,
        mood: currentMood,
        lat: pendingLatLng.lat,
        lng: pendingLatLng.lng
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (fp) {
        closeAddModal();
        addMarkerToMap(fp);
        if (pendingFiles.length > 0) {
          var files = pendingFiles.slice();
          var newFpId = fp.id;
          pendingFiles = [];
          uploadImages(newFpId, files).then(function (savedImages) {
            fp.images = savedImages || [];
            updateFootprintCache(fp);
            loadTimeline();
            if (currentDetailId === newFpId) {
              refreshDetailImages();
            }
          });
        }
        loadTimeline();
        loadStats();
      })
      .catch(function (err) {
        console.error('Failed to add footprint:', err);
      });
  }

  function uploadImages(footprintId, files) {
    var formData = new FormData();
    files.forEach(function (file) {
      formData.append('images', file);
    });
    return fetch('/api/footprints/' + footprintId + '/images', {
      method: 'POST',
      body: formData
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
      })
      .catch(function (err) {
        console.error('Failed to upload images:', err);
        return [];
      });
  }

  function updateFootprintCache(fp) {
    var idx = footprintsCache.findIndex(function (f) { return f.id === fp.id; });
    if (idx >= 0) {
      footprintsCache[idx] = fp;
    } else {
      footprintsCache.push(fp);
    }
  }

  function addMarkerToMap(fp) {
    if (markers[fp.id]) {
      map.removeLayer(markers[fp.id]);
    }
    var color = MOOD_COLORS[fp.mood] || MOOD_COLORS[3];
    var size = 16;

    var icon = L.divIcon({
      className: '',
      html: '<div class="glow-marker" style="' +
        'width:' + size + 'px;' +
        'height:' + size + 'px;' +
        'background:' + color + ';' +
        'border-color:' + color + ';' +
        'box-shadow: 0 0 8px ' + color + ', 0 0 20px ' + color + '80, 0 0 40px ' + color + '40;' +
        '"></div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });

    var marker = L.marker([fp.lat, fp.lng], { icon: icon }).addTo(map);

    marker.on('click', function (e) {
      L.DomEvent.stopPropagation(e);
      showDetailPopup(fp.id);
    });

    markers[fp.id] = marker;
  }

  function fetchFootprintById(id) {
    return fetch('/api/footprints/' + id)
      .then(function (res) {
        if (!res.ok) throw new Error('Footprint not found');
        return res.json();
      })
      .then(function (fp) {
        updateFootprintCache(fp);
        return fp;
      });
  }

  function showDetailPopup(id) {
    var cached = getFootprintLocal(id);
    currentDetailId = id;

    var popup = document.getElementById('detail-popup');
    popup.classList.remove('hidden');
    document.querySelector('.detail-upload').classList.remove('hidden');

    var targetFp = cached || { lat: 0, lng: 0 };
    var point = map.latLngToContainerPoint([targetFp.lat, targetFp.lng]);
    var popupWidth = 320;
    var popupHeight = 420;

    var left = point.x + 20;
    var top = point.y - popupHeight / 2;

    if (left + popupWidth > window.innerWidth) {
      left = point.x - popupWidth - 20;
    }
    if (top < 10) top = 10;
    if (top + popupHeight > window.innerHeight) {
      top = window.innerHeight - popupHeight - 10;
    }

    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    renderDetailGallery([]);
    if (cached) {
      applyDetailData(cached);
    }

    fetchFootprintById(id)
      .then(function (fp) {
        if (currentDetailId !== id) return;
        applyDetailData(fp);
        renderDetailGallery(fp.images || []);
      })
      .catch(function (err) {
        console.error('Failed to load footprint detail:', err);
      });
  }

  function applyDetailData(fp) {
    document.getElementById('detail-name').textContent = fp.name;
    document.getElementById('detail-date').textContent = fp.date;

    var feelingEl = document.getElementById('detail-feeling');
    feelingEl.textContent = fp.feeling || '未记录感受';

    var moodEl = document.getElementById('detail-mood');
    var stars = '';
    for (var i = 1; i <= 5; i++) {
      stars += i <= fp.mood ? '★' : '☆';
    }
    moodEl.textContent = stars + ' ' + (MOOD_LABELS[fp.mood] || '');
  }

  function renderDetailGallery(images) {
    var gallery = document.getElementById('detail-gallery');
    if (!images || images.length === 0) {
      gallery.classList.add('hidden');
      gallery.innerHTML = '';
      return;
    }
    gallery.classList.remove('hidden');
    var html = '';
    images.forEach(function (img, idx) {
      var thumb = imageUrl(img, 'thumb');
      html += '<div class="gallery-item" data-idx="' + idx + '">' +
        '<img data-src="' + thumb + '" alt="" loading="lazy" class="lazy-img">' +
        '</div>';
    });
    gallery.innerHTML = html;
    gallery.querySelectorAll('.gallery-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var idx = parseInt(item.getAttribute('data-idx'), 10);
        openLightbox(images, idx);
      });
    });
    lazyLoadImages();
  }

  function refreshDetailImages() {
    if (currentDetailId == null) return;
    fetchFootprintById(currentDetailId)
      .then(function (fp) {
        if (currentDetailId !== fp.id) return;
        renderDetailGallery(fp.images || []);
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  function closeDetailPopup() {
    document.getElementById('detail-popup').classList.add('hidden');
    document.querySelector('.detail-upload').classList.add('hidden');
    currentDetailId = null;
  }

  function deleteFootprint(id) {
    fetch('/api/footprints/' + id, { method: 'DELETE' })
      .then(function (res) {
        if (!res.ok) throw new Error('Delete failed');
        return res.json();
      })
      .then(function () {
        if (markers[id]) {
          map.removeLayer(markers[id]);
          delete markers[id];
        }
        closeDetailPopup();
        loadTimeline();
        loadStats();
      })
      .catch(function (err) {
        console.error('Failed to delete footprint:', err);
      });
  }

  function openLightbox(images, startIdx) {
    lightboxImages = images || [];
    lightboxIndex = startIdx || 0;
    if (lightboxImages.length === 0) return;
    var img = lightboxImages[lightboxIndex];
    var url = imageUrl(img, 'medium');
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox').classList.remove('hidden');
    updateLightboxNav();
  }

  function closeLightbox() {
    document.getElementById('lightbox').classList.add('hidden');
    document.getElementById('lightbox-img').src = '';
    lightboxImages = [];
    lightboxIndex = 0;
  }

  function updateLightboxNav() {
    var prev = document.querySelector('.lightbox-prev');
    var next = document.querySelector('.lightbox-next');
    prev.style.display = lightboxIndex > 0 ? '' : 'none';
    next.style.display = lightboxIndex < lightboxImages.length - 1 ? '' : 'none';
  }

  function lightboxPrev() {
    if (lightboxIndex <= 0 || lightboxImages.length === 0) return;
    lightboxIndex--;
    var img = lightboxImages[lightboxIndex];
    document.getElementById('lightbox-img').src = imageUrl(img, 'medium');
    updateLightboxNav();
  }

  function lightboxNext() {
    if (lightboxIndex >= lightboxImages.length - 1 || lightboxImages.length === 0) return;
    lightboxIndex++;
    var img = lightboxImages[lightboxIndex];
    document.getElementById('lightbox-img').src = imageUrl(img, 'medium');
    updateLightboxNav();
  }

  function deleteCurrentLightboxImage() {
    if (currentDetailId == null || lightboxImages.length === 0) return;
    var img = lightboxImages[lightboxIndex];
    if (!img) return;
    if (!confirm('确定要删除这张图片吗？')) return;

    fetch('/api/footprints/' + currentDetailId + '/images/' + img.id, {
      method: 'DELETE'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Delete failed');
        return res.json();
      })
      .then(function () {
        closeLightbox();
        refreshDetailImages();
        loadTimeline();
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  function imageUrl(img, size) {
    if (!img) return '';
    if (size === 'thumb' && img.thumb_path) {
      return toWebPath(img.thumb_path);
    }
    if (size === 'medium' && img.medium_path) {
      return toWebPath(img.medium_path);
    }
    if (img.path) return toWebPath(img.path);
    return '';
  }

  function toWebPath(fsPath) {
    if (!fsPath) return '';
    var idx = fsPath.indexOf('uploads');
    if (idx < 0) return '';
    return '/' + fsPath.slice(idx).replace(/\\/g, '/');
  }

  function lazyLoadImages() {
    var images = document.querySelectorAll('img.lazy-img');
    if (!('IntersectionObserver' in window)) {
      images.forEach(function (img) {
        if (img.getAttribute('data-src')) {
          img.src = img.getAttribute('data-src');
          img.removeAttribute('data-src');
        }
      });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (img.getAttribute('data-src')) {
            img.src = img.getAttribute('data-src');
            img.removeAttribute('data-src');
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '100px' });
    images.forEach(function (img) {
      if (img.getAttribute('data-src')) {
        observer.observe(img);
      }
    });
  }

  function loadFootprints() {
    fetch('/api/footprints')
      .then(function (res) { return res.json(); })
      .then(function (footprints) {
        footprintsCache = footprints;
        footprints.forEach(function (fp) {
          addMarkerToMap(fp);
        });
        loadTimeline();
        loadStats();
      })
      .catch(function (err) {
        console.error('Failed to load footprints:', err);
      });
  }

  function loadTimeline() {
    fetch('/api/footprints')
      .then(function (res) { return res.json(); })
      .then(function (footprints) {
        footprintsCache = footprints;
        renderTimeline(footprints);
      })
      .catch(function (err) {
        console.error('Failed to load timeline:', err);
      });
  }

  function renderTimeline(footprints) {
    var list = document.getElementById('timeline-list');

    if (footprints.length === 0) {
      list.innerHTML = '<div class="empty-timeline">' +
        '<div class="empty-icon">🌍</div>' +
        '<p>还没有足迹<br>点击地图开始记录吧</p>' +
        '</div>';
      return;
    }

    var monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

    var html = '';
    footprints.forEach(function (fp) {
      var dateParts = fp.date.split('-');
      var month = monthNames[parseInt(dateParts[1], 10) - 1] || '';
      var day = parseInt(dateParts[2], 10);
      var color = MOOD_COLORS[fp.mood] || MOOD_COLORS[3];
      var stars = '';
      for (var i = 1; i <= 5; i++) {
        stars += i <= fp.mood ? '★' : '☆';
      }

      var thumbHtml = '';
      if (fp.images && fp.images.length > 0) {
        var first = fp.images[0];
        var thumb = imageUrl(first, 'thumb');
        thumbHtml = '<div class="timeline-thumb">' +
          '<img data-src="' + thumb + '" alt="" loading="lazy" class="lazy-img">' +
          (fp.images.length > 1 ? '<span class="timeline-thumb-count">+' + (fp.images.length - 1) + '</span>' : '') +
          '</div>';
      }

      html += '<div class="timeline-item" data-id="' + fp.id + '">' +
        '<div class="timeline-date">' +
        '<div class="month">' + month + '</div>' +
        '<div class="day">' + day + '</div>' +
        '</div>' +
        '<div class="timeline-dot" style="background:' + color + ';color:' + color + ';"></div>' +
        '<div class="timeline-content">' +
        thumbHtml +
        '<h4>' + escapeHtml(fp.name) + '</h4>' +
        '<p>' + escapeHtml(fp.feeling || '未记录感受') + '</p>' +
        '<div class="mood-stars" style="color:' + color + ';">' + stars + '</div>' +
        '</div>' +
        '</div>';
    });

    list.innerHTML = html;

    list.querySelectorAll('.timeline-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var id = parseInt(item.getAttribute('data-id'), 10);
        if (markers[id]) {
          var latlng = markers[id].getLatLng();
          map.setView(latlng, 12, { animate: true });
          setTimeout(function () {
            showDetailPopup(id);
          }, 400);
        }
      });
    });

    lazyLoadImages();
  }

  function getFootprintLocal(id) {
    return footprintsCache.find(function (fp) { return fp.id === id; }) || null;
  }

  function loadStats() {
    fetch('/api/stats')
      .then(function (res) { return res.json(); })
      .then(function (stats) {
        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-cities').textContent = stats.cities;
        document.getElementById('stat-month').textContent = stats.favoriteMonth;
      })
      .catch(function (err) {
        console.error('Failed to load stats:', err);
      });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
