import React, { useState, useEffect, useRef, useMemo } from 'react';
// Importaciones de Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, serverTimestamp } from 'firebase/firestore';
// Importaciones de Iconos
import { AlertTriangle, MapPin, Navigation, Car, Info, LogOut, CloudOff, RefreshCw, Share2, Camera, ArrowRight, ArrowLeft, AlignCenter } from 'lucide-react';



// ==========================================
// ⚠️ ZONA DE CONFIGURACIÓN REAL (MODIFICAR)
// ==========================================

// 1. Borra o comenta la línea de abajo cuando lo uses en TU computadora:
// const firebaseConfig = JSON.parse(__firebase_config); 

// 2. DESCOMENTA y PEGA tus códigos de Firebase aquí abajo:
const firebaseConfig = {
  apiKey: "AIzaSyAv3cDiazZm0bVxCKUDb4hKm7B7rwOzrNE",
  authDomain: "vialert-loja-app.firebaseapp.com",
  projectId: "vialert-loja-app",
  storageBucket: "vialert-loja-app.firebasestorage.app",
  messagingSenderId: "741761156930",
  appId: "1:741761156930:web:e0054a1d08bc605b2b2adb",
  measurementId: "G-Y1JLZ0MWJ2"

};

// ==========================================

// Inicialización
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Cambia esto por un nombre simple para tu base de datos
const appId = "vialert-produccion"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [view, setView] = useState('loading');
  const [reportLocation, setReportLocation] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  
  // Estados Formulario
  const [selectedType, setSelectedType] = useState('bache');
  const [selectedLane, setSelectedLane] = useState('derecho');
  const [description, setDescription] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  
  const [errorMsg, setErrorMsg] = useState(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  
  const mapRef = useRef(null);
  const fileInputRef = useRef(null);

  // Estadísticas
  const stats = useMemo(() => {
    return markers.reduce((acc, curr) => {
      if (curr.type === 'bache') acc.baches += 1;
      if (curr.type === 'falla') acc.fallas += 1;
      return acc;
    }, { baches: 0, fallas: 0 });
  }, [markers]);

  // 1. Autenticación (Modo Producción)
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      if (!auth.currentUser) {
        try {
          // En tu PC, solo necesitas esta línea:
          await signInAnonymously(auth);
        } catch (e) {
          console.error("Error auth:", e);
          if (isMounted) setIsOfflineMode(true);
        }
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!isMounted) return;
      setUser(currentUser);
      if (currentUser) {
        setIsOfflineMode(false);
        setErrorMsg(null);
        setView('map');
      } else {
        setView('auth');
      }
    });
    return () => { isMounted = false; unsubscribe(); };
  }, []);

  // 2. Base de Datos
  useEffect(() => {
    if (!user && !isOfflineMode) return;
    if (isOfflineMode) return;

    let unsubscribeSnapshot = null;
    const startListener = async () => {
        try {
            const collectionPath = collection(db, 'vialert_reports'); // Nombre limpio para producción
            const q = query(collectionPath);
            unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
              const fetchedMarkers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              setMarkers(fetchedMarkers);
              setErrorMsg(null);
            }, (error) => {
              console.warn("Fallo red:", error);
              setIsOfflineMode(true);
              setErrorMsg("Modo Sin Conexión");
            });
        } catch (err) { setIsOfflineMode(true); }
    };
    startListener();
    return () => { if(unsubscribeSnapshot) unsubscribeSnapshot(); };
  }, [user, isOfflineMode]);

  // 3. Carga Leaflet
  useEffect(() => {
    if (view !== 'map') return;
    if (window.L && window.L.map) { setLeafletLoaded(true); return; }
    
    const existingScript = document.getElementById('leaflet-script');
    if (!existingScript) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.id = 'leaflet-script';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => setLeafletLoaded(true);
        document.head.appendChild(script);
    } else {
        const checkL = setInterval(() => { 
            if (window.L && window.L.map) { setLeafletLoaded(true); clearInterval(checkL); } 
        }, 100);
        return () => clearInterval(checkL);
    }
  }, [view]);

  // 4. Inicializar Mapa
  useEffect(() => {
    if (view === 'map' && leafletLoaded && !mapInstance && mapRef.current && window.L) {
       const lojaCoords = [-3.99313, -79.20422];
       const map = window.L.map(mapRef.current, { zoomControl: false }).setView(lojaCoords, 13);
       
       window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
         attribution: '&copy; OSM &copy; CARTO',
         maxZoom: 19
       }).addTo(map);
       
       window.L.control.zoom({ position: 'bottomleft' }).addTo(map);
       
       // Iconos
       const createIcon = (color) => window.L.divIcon({
        className: 'custom-icon',
        html: `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.5);"><div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
       });
    
       map.customIcons = { bache: createIcon('#ef4444'), falla: createIcon('#eab308') };

       setMapInstance(map);
       map.on('click', (e) => { 
           setReportLocation(e.latlng); 
           setDescription(''); 
           setImagePreview(null); 
           setView('report'); 
       });
    }
  }, [view, leafletLoaded, mapInstance]);

  // Actualizar Marcadores
  useEffect(() => {
    if (!mapInstance || !window.L) return;
    
    mapInstance.eachLayer((layer) => {
       if (layer.options && layer.options.icon) mapInstance.removeLayer(layer);
    });

    markers.forEach(marker => {
      const icon = marker.type === 'falla' ? mapInstance.customIcons.falla : mapInstance.customIcons.bache;
      const m = window.L.marker([marker.lat, marker.lng], { icon: icon }).addTo(mapInstance);
      const date = marker.timestamp ? new Date(marker.timestamp.seconds * 1000).toLocaleDateString() : 'Local';
      
      // Info ventana
      const imgHtml = marker.image 
        ? `<div style="margin-bottom: 8px; border-radius: 8px; overflow: hidden; width: 100%; max-height: 120px; display: flex; align-items: center; justify-content: center; background: #f3f4f6;">
             <img src="${marker.image}" style="width: 100%; height: auto; object-fit: cover;" alt="Evidencia" />
           </div>` 
        : '';

      const descHtml = marker.description 
        ? `<div style="background: #f9fafb; padding: 8px; border-radius: 6px; border-left: 3px solid ${marker.type === 'bache' ? '#dc2626' : '#ca8a04'}; margin-bottom: 6px;">
             <p style="margin: 0; font-size: 0.8rem; color: #374151; font-style: italic;">"${marker.description}"</p>
           </div>`
        : '';

      let laneText = "Carril no especificado";
      let laneColor = "#6b7280";
      if (marker.lane === 'derecho') { laneText = "➡️ CARRIL DERECHO"; laneColor = "#3b82f6"; }
      else if (marker.lane === 'izquierdo') { laneText = "⬅️ CARRIL IZQUIERDO"; laneColor = "#8b5cf6"; }
      else if (marker.lane === 'centro') { laneText = "↔️ EJE DE VÍA"; laneColor = "#f59e0b"; }

      m.bindPopup(`
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; min-width: 180px; max-width: 240px;">
          <h3 style="font-weight: 800; font-size: 0.95rem; text-transform: uppercase; margin-bottom: 6px; color: ${marker.type === 'bache' ? '#dc2626' : '#ca8a04'}; display: flex; align-items: center; gap: 4px;">
            ${marker.type === 'bache' ? '⚠️ Bache' : '⛰️ Falla'}
          </h3>
          ${imgHtml}
          <div style="margin-bottom: 6px; padding: 4px 8px; background: ${laneColor}20; border-radius: 4px; display: inline-block;">
             <span style="font-weight: 700; font-size: 0.75rem; color: ${laneColor};">${laneText}</span>
          </div>
          ${descHtml}
          <p style="font-size: 0.7rem; color: #9ca3af; margin: 0; text-align: right;">${date}</p>
        </div>
      `);
    });
  }, [markers, mapInstance]);

  // Lógica de Reporte
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsCompressing(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (ev) => {
        const img = new Image();
        img.src = ev.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 600 / img.width;
            canvas.width = 600;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            setImagePreview(canvas.toDataURL('image/jpeg', 0.6));
            setIsCompressing(false);
        }
    }
  };

  const handleSubmit = async () => {
    const data = {
        type: selectedType,
        lane: selectedLane,
        description,
        image: imagePreview,
        lat: reportLocation.lat,
        lng: reportLocation.lng,
        userId: user?.uid || 'anonymous',
        timestamp: isOfflineMode ? { seconds: Date.now()/1000 } : serverTimestamp()
    };

    if (isOfflineMode) {
        setMarkers(prev => [...prev, { ...data, id: `local_${Date.now()}` }]);
        setView('map'); 
        setReportLocation(null);
        alert("Guardado localmente (Offline).");
    } else {
        try {
            // Usamos nombre de colección de producción
            await addDoc(collection(db, 'vialert_reports'), data);
            setView('map'); 
            setReportLocation(null);
        } catch (e) {
            console.error("Error guardando:", e);
            setIsOfflineMode(true);
            setMarkers(prev => [...prev, { ...data, id: `local_${Date.now()}` }]);
            setView('map'); 
            setReportLocation(null);
        }
    }
  };

  const locateUser = () => {
    if (!navigator.geolocation || !mapInstance) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      mapInstance.setView([latitude, longitude], 16);
      window.L.circleMarker([latitude, longitude], {
        radius: 12, fillColor: "#3b82f6", color: "#fff", weight: 3, opacity: 1, fillOpacity: 0.8
      }).addTo(mapInstance).bindPopup("Tú").openPopup();
    });
  };

  const handleManualRetry = async () => {
    setErrorMsg("Refrescando...");
    if (user) try { await user.getIdToken(true); } catch(e) {}
    setIsOfflineMode(false);
    if (!user) try { await signInAnonymously(auth); } catch(e) { setIsOfflineMode(true); }
  };

  const handleShare = async () => {
    if (navigator.share) {
        try { await navigator.share({ title: 'Vialert Loja', text: 'Reporta baches y fallas.', url: window.location.href }); } catch (err) {}
    } else { alert("Enlace copiado"); }
  };

  if (view === 'loading') return <div className="h-screen bg-slate-900 flex items-center justify-center text-white">Cargando...</div>;

  if (view === 'auth') return (
    <div className="h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-2xl w-full max-w-sm text-center">
            <div className="flex justify-center mb-6">
                <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30"><Car size={48} className="text-white" /></div>
            </div>
            <h1 className="text-2xl text-white font-bold mb-6">Vialert Loja</h1>
            <p className="text-center text-slate-400 mb-8">Seguridad vial colaborativa</p>
            <button onClick={() => signInAnonymously(auth)} className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-lg py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 mb-4 touch-manipulation">
              <Navigation size={24} /> Ingresar
            </button>
        </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex flex-col bg-slate-900 relative">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-[500] p-2">
            <div className="bg-slate-900/90 backdrop-blur border border-white/10 rounded-xl p-3 flex justify-between items-center text-white shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-2 rounded-xl shadow-md"><AlertTriangle size={16} /></div>
                    <div>
                        <h1 className="font-bold text-sm">Vialert Loja</h1>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <div className={`w-2 h-2 rounded-full ${isOfflineMode ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                            {isOfflineMode ? 'Local' : 'En Línea'}
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="flex gap-1 mr-1">
                        <div className="flex flex-col items-center justify-center bg-red-500/10 border border-red-500/20 w-8 h-8 rounded-lg">
                           <span className="text-[10px] font-bold text-red-400">{stats.baches}</span>
                           <div className="w-1 h-1 rounded-full bg-red-500"></div>
                        </div>
                        <div className="flex flex-col items-center justify-center bg-yellow-500/10 border border-yellow-500/20 w-8 h-8 rounded-lg">
                           <span className="text-[10px] font-bold text-yellow-400">{stats.fallas}</span>
                           <div className="w-1 h-1 rounded-full bg-yellow-500"></div>
                        </div>
                    </div>
                    {isOfflineMode && <button onClick={handleManualRetry} className="p-2 bg-slate-800 rounded text-blue-400"><RefreshCw size={16}/></button>}
                    <button onClick={handleShare} className="p-2 bg-slate-800 rounded text-slate-400"><Share2 size={16}/></button>
                    <button onClick={() => signOut(auth)} className="p-2 bg-slate-800 rounded text-slate-400"><LogOut size={16}/></button>
                </div>
            </div>
        </div>

        {/* Mapa */}
        <div ref={mapRef} className="flex-1 z-0 bg-slate-800" />

        {/* Aviso Offline */}
        {isOfflineMode && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[600] bg-yellow-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 cursor-pointer animate-bounce" onClick={handleManualRetry}>
              <CloudOff size={16} /> Sin conexión - Modo Memoria
          </div>
        )}

        {/* Controles Flotantes */}
        <div className="absolute bottom-6 right-4 z-[500] flex flex-col gap-3 items-end">
            <button onClick={locateUser} className="w-12 h-12 bg-slate-800 text-blue-400 rounded-full shadow-xl flex items-center justify-center border border-white/10">
                <Navigation size={24} />
            </button>
            <div className="bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg animate-pulse">Toca el mapa para reportar</div>
        </div>

        {/* Modal de Reporte */}
        {view === 'report' && (
            <div className="absolute inset-0 z-[1000] bg-black/80 flex items-end sm:items-center justify-center">
                <div className="bg-slate-900 w-full sm:w-96 p-5 rounded-t-2xl sm:rounded-2xl border-t border-white/10 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                    <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto opacity-50"></div>
                    <h2 className="text-white font-bold text-lg flex items-center gap-2"><MapPin className="text-blue-500"/> Nuevo Reporte</h2>
                    
                    {/* Tipo */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Tipo de Peligro</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setSelectedType('bache')} className={`p-3 rounded-xl border flex flex-col items-center gap-1 ${selectedType==='bache'?'border-red-500 bg-red-500/20 text-red-400':'border-slate-700 text-slate-400'}`}><AlertTriangle/> <span className="text-xs font-bold">Bache</span></button>
                            <button onClick={() => setSelectedType('falla')} className={`p-3 rounded-xl border flex flex-col items-center gap-1 ${selectedType==='falla'?'border-yellow-500 bg-yellow-500/20 text-yellow-400':'border-slate-700 text-slate-400'}`}><Info/> <span className="text-xs font-bold">Falla</span></button>
                        </div>
                    </div>

                    {/* Foto */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Evidencia</label>
                        <div className="relative h-32 bg-slate-800 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden">
                            {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <div className="text-slate-500 flex flex-col items-center"><Camera /><span className="text-xs">Tomar Foto</span></div>}
                            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="absolute inset-0 opacity-0" />
                        </div>
                    </div>

                    {/* Carril */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Ubicación en vía</label>
                        <div className="flex gap-2">
                            <button onClick={() => setSelectedLane('izquierdo')} className={`flex-1 p-2 rounded-lg border flex flex-col items-center ${selectedLane==='izquierdo' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 text-slate-400'}`}><ArrowLeft size={16}/><span className="text-[10px]">Izq.</span></button>
                            <button onClick={() => setSelectedLane('centro')} className={`flex-1 p-2 rounded-lg border flex flex-col items-center ${selectedLane==='centro' ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-700 text-slate-400'}`}><AlignCenter size={16}/><span className="text-[10px]">Centro</span></button>
                            <button onClick={() => setSelectedLane('derecho')} className={`flex-1 p-2 rounded-lg border flex flex-col items-center ${selectedLane==='derecho' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 text-slate-400'}`}><ArrowRight size={16}/><span className="text-[10px]">Der.</span></button>
                        </div>
                    </div>

                    {/* Descripción */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Referencia</label>
                        <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ej. Frente a tienda azul..." className="w-full bg-slate-800 text-white p-3 rounded-xl text-sm h-16 border border-slate-700 resize-none" />
                    </div>

                    <div className="flex gap-3 mt-2">
                        <button onClick={()=>{setView('map'); setReportLocation(null)}} className="flex-1 py-3 bg-slate-800 text-white rounded-xl border border-slate-700">Cancelar</button>
                        <button onClick={handleSubmit} disabled={isCompressing} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20">{isCompressing ? '...' : 'Publicar'}</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}

