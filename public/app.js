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
    setMoodRating(3);
    document.getElementById('fp-name').focus();
  }

  function closeAddModal() {
    document.getElementById('add-modal').classList.add('hidden');
    pendingLatLng = null;
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
      }
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
        loadTimeline();
        loadStats();
      })
      .catch(function (err) {
        console.error('Failed to add footprint:', err);
      });
  }

  function addMarkerToMap(fp) {
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
      showDetailPopup(fp, marker);
    });

    markers[fp.id] = marker;
  }

  function showDetailPopup(fp, marker) {
    currentDetailId = fp.id;

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

    var popup = document.getElementById('detail-popup');
    popup.classList.remove('hidden');

    var point = map.latLngToContainerPoint([fp.lat, fp.lng]);
    var popupWidth = 280;
    var popupHeight = 220;

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
  }

  function closeDetailPopup() {
    document.getElementById('detail-popup').classList.add('hidden');
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

  function loadFootprints() {
    fetch('/api/footprints')
      .then(function (res) { return res.json(); })
      .then(function (footprints) {
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

      html += '<div class="timeline-item" data-id="' + fp.id + '">' +
        '<div class="timeline-date">' +
        '<div class="month">' + month + '</div>' +
        '<div class="day">' + day + '</div>' +
        '</div>' +
        '<div class="timeline-dot" style="background:' + color + ';color:' + color + ';"></div>' +
        '<div class="timeline-content">' +
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
            showDetailPopup(getFootprintLocal(id), markers[id]);
          }, 400);
        }
      });
    });
  }

  var footprintsCache = [];

  function getFootprintLocal(id) {
    return footprintsCache.find(function (fp) { return fp.id === id; }) || null;
  }

  var origLoadTimeline = loadTimeline;
  loadTimeline = function () {
    fetch('/api/footprints')
      .then(function (res) { return res.json(); })
      .then(function (footprints) {
        footprintsCache = footprints;
        renderTimeline(footprints);
      })
      .catch(function (err) {
        console.error('Failed to load timeline:', err);
      });
  };

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
