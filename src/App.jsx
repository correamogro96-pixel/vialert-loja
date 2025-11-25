import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Navigation, Car, Shield, Activity, AlertOctagon, Locate, Newspaper, ChevronUp,
  Radio, Clock, User, LogOut, AlertTriangle, Camera, Trash2, Search, Map as MapIcon,
  ArrowRight, ThumbsUp, ThumbsDown, Award, Volume2, Wifi, WifiOff, TrendingUp,
  TrendingDown, ShieldAlert, Globe, X, Loader2
} from 'lucide-react';

// --- LEAFLET IMPORTS (SOLUCIÓN MAPA) ---
import L from 'leaflet';
import 'leaflet/dist/leaflet.css'; // <--- Esto arregla el mapa gris/vacío

// --- SUPABASE IMPORTS ---
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURACIÓN SUPABASE ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// --- CONSTANTES ---

const ALERT_TYPES = {
  BACHE: {
    id: 'bache', label: 'Bache / Daño', color: '#ef4444', twColor: 'red', icon: AlertOctagon,
    desc: 'Huecos o alcantarillas sin tapa', subtypes: ['Pequeño', 'Grande', 'Muy Grande'],
    hasTimer: false, deleteThreshold: 2, photoRequired: false
  },
  FALLA: {
    id: 'falla', label: 'Falla Geológica', color: '#eab308', twColor: 'yellow', icon: Activity,
    desc: 'Hundimientos o grietas', subtypes: ['Desnivel', 'Joroba', 'Socavón', 'Cuarteado', 'Pérdida de mesa'],
    hasTimer: false, deleteThreshold: 2, photoRequired: true
  },
  ACCIDENTE: {
    id: 'accidente', label: 'Accidente', color: '#f97316', twColor: 'orange', icon: Car,
    desc: 'Colisiones o averias', warning: 'PRECAUCIÓN',
    hasTimer: false, deleteThreshold: 1, photoRequired: false
  },
  CONTROL: {
    id: 'control', label: 'Control / Agente', color: '#3b82f6', twColor: 'blue', icon: Shield,
    desc: 'Operativos de tránsito',
    hasTimer: true, deleteThreshold: 1, photoRequired: false
  }
};

const DURATIONS = [{ val: 30, label: '30 min' }, { val: 60, label: '1 h' }, { val: 120, label: '2 h' }];

const NEWS_FEED = [
  { id: 1, title: 'Cierre Via Loja-Catamayo', body: 'Derrumbe en el km 12. Paso restringido.', type: 'CRITICO', time: 'Hace 20 min' },
  { id: 2, title: 'Neblina en Villonaco', body: 'Visibilidad reducida. Encienda luces.', type: 'ALERTA', time: 'Hace 45 min' },
];

const TRUST_LEVELS = {
  BANNED: { min: -999, max: 0, label: 'BLOQUEADO', color: 'text-red-600', bg: 'bg-red-900/20', icon: ShieldAlert },
  OBSERVATION: { min: 1, max: 50, label: 'EN OBSERVACIÓN', color: 'text-yellow-500', bg: 'bg-yellow-900/20', icon: AlertTriangle },
  ACTIVE: { min: 51, max: 9999, label: 'ACTIVO', color: 'text-green-500', bg: 'bg-green-900/20', icon: Shield }
};

// --- UTILIDADES ---

const getTrustStatus = (score) => {
  if (score <= 0) return TRUST_LEVELS.BANNED;
  if (score <= 50) return TRUST_LEVELS.OBSERVATION;
  return TRUST_LEVELS.ACTIVE;
};

const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const deg2rad = (deg) => deg * (Math.PI / 180);

const resizeImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width, height = img.height;
        const MAX = 600;
        if (width > height) {
          if (width > MAX) { height *= MAX / width; width = MAX; }
        } else {
          if (height > MAX) { width *= MAX / height; height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.5));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

const speakAlert = (text) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  }
};

const searchLocation = async (queryText) => {
  if (!queryText) return [];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryText + ' Loja Ecuador')}&limit=3`);
    return await res.json();
  } catch (e) { console.error("Error geocoding", e); return []; }
};

const fetchRoute = async (start, end) => {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) return data.routes[0];
    return null;
  } catch (e) { console.error("Error routing", e); return null; }
};

const isAlertOnRoute = (alert, routeCoordinates) => {
  const THRESHOLD_KM = 0.05;
  for (let i = 0; i < routeCoordinates.length; i += 5) {
    const [lng, lat] = routeCoordinates[i];
    const dist = getDistanceFromLatLonInKm(alert.lat, alert.lng, lat, lng);
    if (dist < THRESHOLD_KM) return true;
  }
  return false;
};

// --- COMPONENTES UI ---

const SplashScreen = ({ onLogin, loading }) => (
  <div className="absolute inset-0 z-[5000] bg-gray-900 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
    <div className="mb-8 relative">
      <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 rounded-full"></div>
      <div className="relative bg-gray-800 p-6 rounded-3xl border border-gray-700 shadow-2xl">
        <Navigation size={64} className="text-blue-500 fill-current" />
      </div>
    </div>
    <h1 className="text-4xl font-black text-white mb-2 tracking-tight">VIALERT <span className="text-blue-500">LOJA</span></h1>
    <p className="text-gray-400 mb-8 max-w-xs text-sm">Sistema colaborativo de seguridad vial.</p>
    
    <div className="w-full max-w-xs space-y-3">
      {loading ? (
        <div className="flex flex-col items-center gap-2 text-blue-500">
           <Loader2 size={32} className="animate-spin" />
           <p className="text-sm">Iniciando sesión...</p>
        </div>
      ) : (
        <>
          <button onClick={() => onLogin('google')} className="w-full bg-white hover:bg-gray-100 text-gray-900 font-bold py-3 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
            <Globe size={20} className="text-blue-600"/> Continuar con Google
          </button>
          
          <button onClick={() => onLogin('anon')} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
            <User size={20} /> Ingreso Anónimo
          </button>
        </>
      )}
      <div className="text-xs text-gray-500 pt-4 border-t border-gray-800 mt-4"><p>v4.6 Local Map Fix</p></div>
    </div>
  </div>
);

const RoutePanel = ({ onRouteCalculated, onClose, userLocation, isOnline }) => {
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [originCoords, setOriginCoords] = useState(userLocation || null);
  const [destCoords, setDestCoords] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [activeField, setActiveField] = useState(null);

  const handleSearch = async (text, field) => {
    if (!isOnline) return;
    if (field === 'origin') setOriginText(text); else setDestText(text);
    if (text.length > 2) {
      const results = await searchLocation(text);
      setSearchResults(results);
      setActiveField(field);
    } else { setSearchResults([]); }
  };

  const selectLocation = (result) => {
    const coords = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
    if (activeField === 'origin') {
      setOriginCoords(coords);
      setOriginText(result.display_name.split(',')[0]);
    } else {
      setDestCoords(coords);
      setDestText(result.display_name.split(',')[0]);
    }
    setSearchResults([]);
  };

  const calculate = async () => {
    if (!originCoords || !destCoords) return;
    setIsSearching(true);
    const route = await fetchRoute(originCoords, destCoords);
    setIsSearching(false);
    if (route) onRouteCalculated({ route, origin: originCoords, dest: destCoords });
  };

  return (
    <div className="fixed top-0 left-0 w-full h-full z-[3000] bg-gray-900/95 backdrop-blur-md p-4 animate-in slide-in-from-bottom duration-300 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2"><MapIcon size={20} className="text-blue-500"/> Planificar Ruta</h2>
        <button onClick={onClose} className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
      </div>
      <div className="space-y-4 relative">
        <div className="relative">
          <div className="flex items-center gap-3 bg-gray-800 p-3 rounded-xl border border-gray-700 focus-within:border-blue-500 transition-colors">
            <div className="w-3 h-3 rounded-full bg-green-500 shrink-0"></div>
            <input type="text" placeholder="Origen" value={originText} onChange={(e) => handleSearch(e.target.value, 'origin')} className="bg-transparent text-white w-full focus:outline-none text-sm" disabled={!isOnline}/>
            <button className="text-gray-500 hover:text-white" onClick={() => { setOriginCoords(userLocation); setOriginText("Mi Ubicación"); }}><Locate size={16} /></button>
          </div>
        </div>
        <div className="relative">
          <div className="flex items-center gap-3 bg-gray-800 p-3 rounded-xl border border-gray-700 focus-within:border-blue-500 transition-colors">
            <div className="w-3 h-3 rounded-full bg-red-500 shrink-0"></div>
            <input type="text" placeholder="¿A dónde vas?" value={destText} onChange={(e) => handleSearch(e.target.value, 'dest')} className="bg-transparent text-white w-full focus:outline-none text-sm" disabled={!isOnline}/>
          </div>
        </div>
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 w-full bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 mt-2 overflow-hidden">
            {searchResults.map((res, i) => (
              <button key={i} onClick={() => selectLocation(res)} className="w-full text-left p-3 hover:bg-gray-700 border-b border-gray-700 last:border-0 text-sm text-gray-300 truncate">{res.display_name}</button>
            ))}
          </div>
        )}
        <div className="mt-6">
          <button onClick={calculate} disabled={!originCoords || !destCoords || isSearching || !isOnline} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all">
            {isSearching ? 'Calculando...' : 'TRAZAR RUTA'} <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

const ProximityAlert = ({ alert, distance }) => {
  if (!alert) return null;
  const config = ALERT_TYPES[alert.type] || ALERT_TYPES.BACHE;
  const Icon = config.icon;

  return (
    <div className="fixed top-20 left-4 right-4 z-[2000] animate-in slide-in-from-top duration-500">
      <div className="backdrop-blur-xl bg-gray-900/90 border-l-4 rounded-r-xl shadow-xl flex items-center p-4 gap-4" style={{ borderColor: config.color }}>
        <div className="p-3 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: `${config.color}30` }}><Icon size={24} style={{ color: config.color }} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2"><AlertTriangle size={14} className="text-yellow-500" /> Precaución!</h4>
            <span className="text-xs font-mono font-bold text-white bg-red-600 px-2 rounded-full">{Math.round(distance * 1000)}m</span>
          </div>
          <p className="text-gray-300 text-sm truncate font-medium">
            {alert.subtype ? `${config.label}: ${alert.subtype}` : config.label} detectado.
          </p>
        </div>
        <div className="p-2 bg-white/10 rounded-full animate-pulse"><Volume2 size={16} className="text-white" /></div>
      </div>
    </div>
  );
};

const Header = ({ authStatus, isOnline, onProfileClick, onRouteClick }) => (
  <header className="bg-gray-900/95 backdrop-blur-md text-white p-4 shadow-lg flex justify-between items-center fixed top-0 w-full z-[1000] border-b border-gray-800">
    <div className="flex items-center gap-3">
      <div className="bg-blue-600 p-2 rounded-xl shadow-blue-900/20"><Navigation size={20} className="text-white fill-current" /></div>
      <div>
        <h1 className="font-bold text-xl leading-none tracking-tight">VIALERT</h1>
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-orange-500'}`}></span>
          <span className="text-[10px] text-gray-400 font-mono tracking-widest uppercase">{isOnline ? 'ONLINE' : 'OFFLINE MODE'}</span>
        </div>
      </div>
    </div>
    <div className="flex gap-2 items-center">
      <button onClick={onRouteClick} className="p-3 bg-gray-800 rounded-full hover:bg-gray-700 text-blue-400 border border-gray-700 transition-colors"><MapIcon size={20} /></button>
      <button onClick={onProfileClick} className="p-3 bg-gray-800 rounded-full hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"><User size={20} /></button>
    </div>
  </header>
);

const UserProfile = ({ user, userData, onClose, onLogout }) => {
  const status = getTrustStatus(userData?.trust_score || 100);
  const StatusIcon = status.icon;
  return (
    <div className="fixed inset-0 z-[3000] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
      <div className="bg-gray-900 w-full max-w-xs rounded-2xl border border-gray-700 shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={20} /></button>
        <div className="flex flex-col items-center mb-4">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-3 border-4 shadow-lg ${status === TRUST_LEVELS.BANNED ? 'border-red-600 bg-red-900/20' : 'border-blue-500 bg-blue-900/20'}`}>
            <User size={48} className="text-gray-200" />
          </div>
          <h2 className="text-white font-bold text-xl mb-1">{user?.email?.split('@')[0] || 'Anónimo'}</h2>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${status.color} ${status.bg} border-current`}>
            <StatusIcon size={14} />
            <span className="text-xs font-bold tracking-wider">{status.label}</span>
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 mb-4 relative overflow-hidden">
          <div className="flex justify-between items-end mb-2 relative z-10">
            <span className="text-gray-400 text-xs uppercase font-bold">Trust Score</span>
            <span className={`text-2xl font-black ${status.color}`}>{userData?.trust_score || 100}</span>
          </div>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden relative z-10">
            <div className={`h-full transition-all duration-500 ${userData?.trust_score < 0 ? 'bg-red-600' : 'bg-gradient-to-r from-blue-500 to-green-400'}`} style={{ width: `${Math.max(0, Math.min(100, userData?.trust_score || 100))}%` }}></div>
          </div>
          <div className="absolute -right-4 -bottom-8 opacity-10 text-white"><Award size={80} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-gray-800 p-3 rounded-xl border border-gray-700 text-center">
            <div className="flex items-center justify-center gap-1 text-green-400 mb-1"><TrendingUp size={16} /></div>
            <p className="text-2xl font-bold text-white">{userData?.reports_count || 0}</p>
            <p className="text-[9px] text-gray-400 uppercase font-bold">Reportes</p>
          </div>
          <div className="bg-gray-800 p-3 rounded-xl border border-gray-700 text-center">
            <div className="flex items-center justify-center gap-1 text-red-400 mb-1"><TrendingDown size={16} /></div>
            <p className="text-2xl font-bold text-white">{userData?.penalties || 0}</p>
            <p className="text-[9px] text-gray-400 uppercase font-bold">Sanciones</p>
          </div>
        </div>
        <button onClick={onLogout} className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"><LogOut size={18} /> Cerrar Sesión</button>
      </div>
    </div>
  );
};

const ReportModal = ({ onClose, onSubmit, trustStatus, isOnline }) => {
  const [selectedType, setSelectedType] = useState(null);
  const [subtype, setSubtype] = useState(null);
  const [desc, setDesc] = useState('');
  const [duration, setDuration] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [processingImage, setProcessingImage] = useState(false);

  useEffect(() => { setSubtype(null); setDuration(selectedType === 'control' ? 60 : null); }, [selectedType]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setProcessingImage(true);
      try { const resized = await resizeImage(file); setPhoto(resized); } catch (err) { console.error(err); } finally { setProcessingImage(false); }
    }
  };

  const currentConfig = selectedType ? ALERT_TYPES[selectedType] : null;
  const isPhotoValid = !currentConfig?.photoRequired || (currentConfig?.photoRequired && photo);
  const isBanned = trustStatus === TRUST_LEVELS.BANNED;

  if (isBanned) {
    return (
      <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-gray-900 p-6 rounded-2xl border border-red-600 text-center max-w-xs shadow-2xl shadow-red-900/50">
          <ShieldAlert size={48} className="mx-auto text-red-500 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Cuenta Bloqueada</h3>
          <p className="text-gray-400 text-sm mb-4">Tu puntaje de confianza es demasiado bajo para realizar reportes.</p>
          <button onClick={onClose} className="bg-gray-800 text-white px-4 py-2 rounded-lg">Entendido</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 w-full max-w-sm rounded-2xl border border-gray-700 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50 sticky top-0 backdrop-blur z-10">
          <h3 className="text-white font-bold text-lg flex items-center gap-2"><MapPin size={18} className="text-blue-400"/> Reportar</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700 text-gray-400"><X size={24} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`text-xs p-2 rounded border text-center font-bold flex items-center justify-center gap-2 ${trustStatus === TRUST_LEVELS.OBSERVATION ? 'bg-yellow-900/30 border-yellow-800 text-yellow-200' : 'bg-green-900/30 border-green-800 text-green-200'}`}>
            <trustStatus.icon size={14} />
            {trustStatus === TRUST_LEVELS.OBSERVATION ? 'En Observación: Tu reporte requiere validación' : 'Usuario Activo: Publicación Inmediata'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(ALERT_TYPES).map(([key, type]) => {
              const IconComponent = type.icon;
              const isSelected = selectedType === key;
              return (
                <button key={key} onClick={() => setSelectedType(key)} className={`p-4 h-32 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${isSelected ? `border-${type.twColor}-500 bg-gray-800 shadow-lg scale-[1.02]` : 'border-transparent bg-gray-800/50 hover:bg-gray-800 active:scale-95'}`} style={{ borderColor: isSelected ? type.color : 'transparent' }}>
                  <IconComponent size={40} style={{ color: isSelected ? type.color : '#9ca3af' }} />
                  <span className={`text-sm font-bold uppercase tracking-wide ${isSelected ? 'text-white' : 'text-gray-400'}`}>{type.label}</span>
                </button>
              );
            })}
          </div>
          {selectedType && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <div className="text-xs text-gray-400 bg-gray-800/50 p-2 rounded border border-gray-700 flex items-center gap-2 mb-3"><Activity size={12} /> {currentConfig.desc}</div>
              {currentConfig.subtypes && (
                <div className="mb-3">
                  <label className="text-gray-400 text-[10px] uppercase font-bold mb-2 block">Detalles</label>
                  <div className="flex flex-wrap gap-2">{currentConfig.subtypes.map(sub => (<button key={sub} onClick={() => setSubtype(sub)} className={`px-4 py-3 text-sm font-bold rounded-lg border transition-all ${subtype === sub ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>{sub}</button>))}</div>
                </div>
              )}
              {currentConfig.hasTimer && (
                <div className="bg-gray-800/30 p-3 rounded-xl border border-gray-700/50 mb-3">
                  <label className="text-gray-400 text-[10px] uppercase font-bold mb-2 flex items-center gap-2"><Clock size={12} /> Duracion</label>
                  <div className="flex gap-2">{DURATIONS.map((d) => (<button key={d.val} onClick={() => setDuration(d.val)} className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${duration === d.val ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>{d.label}</button>))}</div>
                </div>
              )}
              <div className={`bg-gray-800/30 p-3 rounded-xl border mb-3 ${currentConfig.photoRequired && !photo ? 'border-red-500/50' : 'border-gray-700/50'}`}>
                <label className={`text-[10px] uppercase font-bold mb-2 flex items-center gap-2 ${currentConfig.photoRequired ? 'text-red-400' : 'text-gray-400'}`}>
                  <Camera size={12} /> Evidencia {currentConfig.photoRequired ? '(Obligatorio)' : '(Opcional)'}
                </label>
                {processingImage ? <div className="flex justify-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500"></div></div> : photo ? <div className="relative w-full h-32 bg-gray-900 rounded-lg overflow-hidden border border-gray-700 group"><img src={photo} alt="Evidencia" className="w-full h-full object-cover opacity-80" /><button onClick={() => setPhoto(null)} className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full"><X size={16} /></button></div> : <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700/30"><div className="flex flex-col items-center pt-5 pb-6"><Camera size={24} className="text-gray-500 mb-2"/><p className="text-xs text-gray-500">Toca para foto</p></div><input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} /></label>}
              </div>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Detalles adicionales..." className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" rows={2}/>
            </div>
          )}
          <button onClick={() => onSubmit({ type: selectedType, subtype, desc, duration, photo })} disabled={!selectedType || (currentConfig?.subtypes && !subtype) || processingImage || !isPhotoValid} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all text-lg">
            CONFIRMAR REPORTE
          </button>
        </div>
      </div>
    </div>
  );
};

// --- APP PRINCIPAL ---

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [authStatus, setAuthStatus] = useState('loading');
  const [showSplash, setShowSplash] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showRoutePanel, setShowRoutePanel] = useState(false);
  const [tempMarkerPos, setTempMarkerPos] = useState(null);
  const [showNews, setShowNews] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const [userLocation, setUserLocation] = useState(null);
  const [nearestAlert, setNearestAlert] = useState(null);
  const [allAlertsData, setAllAlertsData] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeRoute, setActiveRoute] = useState(null);
  const [alertsOnRouteCount, setAlertsOnRouteCount] = useState(0);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const userMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const markersRef = useRef({});
  const currentUserRef = useRef(null);
  const lastSpokenIdRef = useRef(null);

  // GESTIÓN DE ESTADO DE RED
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // GESTIÓN DE SESIÓN
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        currentUserRef.current = session.user;
        setAuthStatus('online');
        setShowSplash(false);
      } else {
        setAuthStatus('offline');
        setShowSplash(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        currentUserRef.current = session.user;
        setAuthStatus('online');
        setShowSplash(false);
      } else {
        setUser(null);
        currentUserRef.current = null;
        setUserData(null);
        setAuthStatus('offline');
        setShowSplash(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // GESTIÓN DE PERFIL
  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      let { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!data && !error) {
        const newProfile = { id: user.id, trust_score: 100, reports_count: 0, penalties: 0 };
        const { error: insertError } = await supabase.from('profiles').insert(newProfile);
        if (!insertError) setUserData(newProfile);
      } else if (data) {
        setUserData(data);
      }
    };

    fetchProfile();

    const channel = supabase
      .channel('profile-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, (payload) => {
        setUserData(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // LOGICA VOTOS
  useEffect(() => {
    window.vialertValidate = async (alertId) => {
      const uid = currentUserRef.current?.id;
      if (!uid) { alert("Inicia sesión para votar"); return; }
      
      try {
        const { data: alertData, error } = await supabase.from('alerts').select('*').eq('id', alertId).single();
        if (error || !alertData) return;

        if (alertData.positive_voters?.includes(uid)) return;

        const newVotes = (alertData.votes || 0) + 1;
        const newVoters = [...(alertData.positive_voters || []), uid];
       
        await supabase.from('alerts').update({
          votes: newVotes,
          positive_voters: newVoters,
          status: 'active'
        }).eq('id', alertId);

        if (newVotes >= 3 && !alertData.rewarded) {
          await supabase.from('alerts').update({ rewarded: true }).eq('id', alertId);
          if (alertData.created_by) {
             const { data: creator } = await supabase.from('profiles').select('trust_score').eq('id', alertData.created_by).single();
             if (creator) {
               await supabase.from('profiles').update({ trust_score: creator.trust_score + 5 }).eq('id', alertData.created_by);
             }
          }
        }
      } catch (error) { console.error(error); }
    };

    window.vialertReportMissing = async (alertId) => {
      const uid = currentUserRef.current?.id;
      if (!uid) { alert("Inicia sesión para reportar"); return; }

      try {
        const { data: alertData } = await supabase.from('alerts').select('reports, negative_voters').eq('id', alertId).single();
        if (!alertData) return;
        
        if (alertData.negative_voters?.includes(uid)) return;

        await supabase.from('alerts').update({
          reports: (alertData.reports || 0) + 1,
          negative_voters: [...(alertData.negative_voters || []), uid]
        }).eq('id', alertId);
       
      } catch (error) { console.error(error); }
    };
  }, []);

  useEffect(() => {
    if (allAlertsData.length === 0) return;
    allAlertsData.forEach(async (alert) => {
      const threshold = ALERT_TYPES[alert.type]?.deleteThreshold || 2;
      if (alert.reports >= threshold) {
        try {
          await supabase.from('alerts').delete().eq('id', alert.id);
        } catch (e) { console.error(e); }
      }
    });
  }, [allAlertsData]);

  // LOGIN
  const handleLogin = async (method) => {
    setLoginLoading(true);
    try {
      if (method === 'anon') {
        const fakeEmail = `loja_${Math.floor(Math.random()*90000)+1000}@vialert.app`;
        const fakePass = 'vialert123';
        const { data, error } = await supabase.auth.signUp({ email: fakeEmail, password: fakePass });

        if (error) {
           console.error("Error Auth:", error);
           alert("Error de autenticación: " + error.message);
        } else if (!data.session) {
            alert("⚠️ Desactiva 'Confirm email' en Supabase.");
        }

      } else if (method === 'google') {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin }
        });
        if (error) throw error;
      }
    } catch (error) {
      console.error("Login Error:", error);
      alert("Error iniciando sesión: " + error.message);
    } finally {
        setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShowProfile(false);
    setShowSplash(true);
  };

  // --- INICIALIZACIÓN MAPA (LOCAL) ---
  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
      try {
        const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false }).setView([-3.99313, -79.20422], 15);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19, attribution: '&copy; CARTO'
        }).addTo(map);

        map.on('click', (e) => {
          if (currentUserRef.current) {
            setTempMarkerPos(e.latlng);
            setShowModal(true);
          }
        });

        mapInstanceRef.current = map;

        const userIcon = L.divIcon({
          className: 'custom-user-icon',
          html: '<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_15px_#3b82f6] relative"><div class="absolute -inset-4 bg-blue-500/30 rounded-full animate-ping"></div></div>',
          iconSize: [16, 16], iconAnchor: [8, 8]
        });

        const userMarker = L.marker([-3.99313, -79.20422], { icon: userIcon }).addTo(map);
        userMarkerRef.current = userMarker;

        if (navigator.geolocation) {
          navigator.geolocation.watchPosition((pos) => {
            const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            userMarker.setLatLng([newLoc.lat, newLoc.lng]);
            setUserLocation(newLoc);
          }, (err) => console.warn(err), { enableHighAccuracy: true });
        }
      } catch (e) { console.error(e); }
    }
  }, []);

  // SUSCRIPCIÓN A ALERTAS
  useEffect(() => {
    if (!user || !mapInstanceRef.current) return;
   
    const fetchAlerts = async () => {
      const { data, error } = await supabase.from('alerts').select('*');
      if (data) processAlerts(data);
    };
   
    fetchAlerts();

    const channel = supabase
      .channel('public-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
         fetchAlerts();
      })
      .subscribe();

    const processAlerts = (alerts) => {
      const now = Date.now();
      const currentIds = [];
      const activeAlerts = [];

      alerts.forEach(data => {
        const expires = Number(data.expires_at);
        if (expires > now) {
          const id = data.id;
          currentIds.push(id);
          activeAlerts.push({ id, ...data });

          if (!markersRef.current[id]) {
            const config = ALERT_TYPES[data.type] || ALERT_TYPES.BACHE;
            const isPending = data.status === 'pending';
            const markerColor = config.color;
            const markerOpacity = isPending ? 0.6 : 1;
            const markerInnerHtml = isPending ? '<span style="color:white;font-weight:bold;font-size:14px">?</span>' : '';
           
            const iconHtml = `<div style="background-color: ${markerColor}; opacity: ${markerOpacity}; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.5);">${markerInnerHtml || '<div style="width: 10px; height: 10px; background-color: white; border-radius: 50%;"></div>'}</div>`;

            const icon = L.divIcon({ className: 'custom-marker', html: iconHtml, iconSize: [28, 28], iconAnchor: [14, 14] });

            let actionBtns = '';
            if (isPending) {
              actionBtns = `<button onclick="window.vialertValidate('${id}')" class="w-full mt-2 bg-green-100 hover:bg-green-200 text-green-800 font-bold py-1 px-2 rounded text-xs border border-green-300 transition-colors flex items-center justify-center gap-1"> Validar</button>`;
            } else {
              const threshold = config.deleteThreshold || 1;
              actionBtns = `<button onclick="window.vialertReportMissing('${id}')" class="w-full mt-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold py-1 px-2 rounded text-xs border border-red-200 transition-colors flex items-center justify-center gap-1"> No existe (${data.reports || 0}/${threshold})</button>`;
            }

            const marker = L.marker([data.lat, data.lng], { icon }).bindPopup(`
              <div class="text-gray-800 font-sans p-1 min-w-[180px]">
                 ${isPending ? '<div class="bg-gray-200 text-[10px] px-1 rounded mb-1 inline-block"> Revisión</div>' : ''}
                 <strong style="color: ${config.color}" class="uppercase text-sm block mt-1">${config.label}</strong>
                 ${data.subtype ? `<div class="text-xs font-bold mb-1 border-b pb-1">${data.subtype}</div>` : ''}
                 <span class="text-xs text-gray-600 block mb-1">${data.description || config.desc}</span>
                 ${data.photo ? `<div class="w-full h-24 mb-1 rounded bg-gray-200 overflow-hidden"><img src="${data.photo}" class="w-full h-full object-cover" /></div>` : ''}
                 ${actionBtns}
              </div>
            `).addTo(mapInstanceRef.current);
            markersRef.current[id] = marker;
          }
        }
      });

      setAllAlertsData(activeAlerts);

      Object.keys(markersRef.current).forEach(id => {
        if (!currentIds.includes(id)) {
          mapInstanceRef.current.removeLayer(markersRef.current[id]);
          delete markersRef.current[id];
        }
      });
    };

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // PROXIMITY ALERT
  useEffect(() => {
    if (!userLocation || allAlertsData.length === 0) {
      setNearestAlert(null); return;
    }
    let closest = null, minDist = 1.0;
    allAlertsData.forEach(alert => {
      const dist = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, alert.lat, alert.lng);
      if (dist < minDist) { minDist = dist; closest = { alert, distance: dist }; }
    });

    setNearestAlert(closest);

    if (closest && lastSpokenIdRef.current !== closest.alert.id) {
      const config = ALERT_TYPES[closest.alert.type] || ALERT_TYPES.BACHE;
      speakAlert(`Precaución, ${config.label} ${closest.alert.subtype || ''} a ${Math.round(closest.distance * 1000)} metros.`);
    }
    lastSpokenIdRef.current = closest?.alert?.id;
  }, [userLocation, allAlertsData]);

  const handleRouteCalculated = ({ route, origin, dest }) => {
    if (!mapInstanceRef.current) return;

    if (routeLayerRef.current) mapInstanceRef.current.removeLayer(routeLayerRef.current);

    const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
    const routeLine = L.polyline(coords, { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(mapInstanceRef.current);

    L.circleMarker([origin.lat, origin.lng], { color: 'green', radius: 8 }).addTo(mapInstanceRef.current);
    L.circleMarker([dest.lat, dest.lng], { color: 'red', radius: 8 }).addTo(mapInstanceRef.current);

    mapInstanceRef.current.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    routeLayerRef.current = routeLine;

    let count = 0;
    allAlertsData.forEach(alert => { if (isAlertOnRoute(alert, route.geometry.coordinates)) count++; });

    setActiveRoute(true);
    setAlertsOnRouteCount(count);
    setShowRoutePanel(false);
  };

  const clearRoute = () => {
    if (routeLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(routeLayerRef.current);
    }
    setActiveRoute(false);
  };

  const handleSubmitAlert = async ({ type, subtype, desc, duration, photo }) => {
    if (!tempMarkerPos || !user || !userData) return;
   
    let durationMinutes = ALERT_TYPES[type].hasTimer ? (duration || 60) : 24 * 60;
    const expiresAt = Date.now() + (durationMinutes * 60 * 1000);
    const score = userData.trust_score || 100;
    const initialStatus = score > 50 ? 'active' : 'pending';

    try {
      const { error } = await supabase.from('alerts').insert({
        type,
        subtype: subtype || null,
        description: desc,
        lat: tempMarkerPos.lat,
        lng: tempMarkerPos.lng,
        photo: photo || null,
        created_by: user.id,
        expires_at: expiresAt,
        status: initialStatus
      });

      if (error) throw error;

      const { error: profileError } = await supabase.from('profiles').update({
        reports_count: (userData.reports_count || 0) + 1
      }).eq('id', user.id);

      setShowModal(false); setTempMarkerPos(null);
    } catch (e) { console.error(e); }
  };

  const handleRecenter = () => {
    if (mapInstanceRef.current && userMarkerRef.current) {
      mapInstanceRef.current.setView(userMarkerRef.current.getLatLng(), 16);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 font-sans text-gray-100 overflow-hidden relative">
      {showSplash && <SplashScreen onLogin={handleLogin} loading={loginLoading} />}
      {showProfile && <UserProfile user={user} userData={userData} onClose={() => setShowProfile(false)} onLogout={handleLogout} />}
     
      <Header authStatus={authStatus} isOnline={isOnline} onProfileClick={() => setShowProfile(true)} onRouteClick={() => setShowRoutePanel(true)} />

      {showRoutePanel && <RoutePanel onRouteCalculated={handleRouteCalculated} onClose={() => setShowRoutePanel(false)} userLocation={userLocation} isOnline={isOnline} />}

      {!isOnline && <div className="fixed top-16 left-0 w-full bg-orange-600 text-white text-xs font-bold py-1 px-2 text-center z-[2000] shadow-md flex items-center justify-center gap-2 animate-in slide-in-from-top"><WifiOff size={14} /> Sin conexión a Internet.</div>}

      {nearestAlert && !activeRoute && <ProximityAlert alert={nearestAlert.alert} distance={nearestAlert.distance} />}

      {activeRoute && (
        <div className={`fixed top-20 left-4 right-4 z-[2000] p-4 rounded-xl shadow-xl flex items-center justify-between animate-in slide-in-from-top ${alertsOnRouteCount > 0 ? 'bg-red-900/90 border-l-4 border-red-500' : 'bg-green-900/90 border-l-4 border-green-500'}`}>
          <div>
            <h4 className={`font-bold uppercase text-sm ${alertsOnRouteCount > 0 ? 'text-red-200' : 'text-green-200'}`}>{alertsOnRouteCount > 0 ? 'Alertas en ruta' : 'Ruta Despejada'}</h4>
            <p className="text-xs text-white/80">{alertsOnRouteCount > 0 ? `Se detectaron ${alertsOnRouteCount} incidentes.` : 'Buen viaje.'}</p>
          </div>
          <button onClick={clearRoute} className="bg-white/10 hover:bg-white/20 p-2 rounded-full"><X size={16} /></button>
        </div>
      )}

      <main className="flex-1 relative z-0">
        <div ref={mapContainerRef} className="h-full w-full bg-gray-900" />
        <button onClick={handleRecenter} className="absolute bottom-24 right-4 z-[400] bg-gray-800 text-blue-400 p-3 rounded-full shadow-lg border border-gray-700 hover:text-white transition-colors active:scale-95"><Locate size={24} /></button>
        {!showModal && !showSplash && !showRoutePanel && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[400] pointer-events-none">
            <div className="bg-gray-900/80 backdrop-blur px-4 py-2 rounded-full border border-gray-700 shadow-lg flex items-center gap-2">
              <Radio size={12} className="text-blue-400 animate-pulse" />
              <span className="text-xs font-bold text-gray-300">Toca el mapa para reportar</span>
            </div>
          </div>
        )}
      </main>

      <div className={`fixed bottom-0 left-0 w-full bg-gray-900 border-t border-gray-800 transition-all duration-300 z-[1000] ${showNews ? 'h-2/3' : 'h-16'}`}>
        <div onClick={() => setShowNews(!showNews)} className="h-16 flex items-center justify-between px-4 cursor-pointer hover:bg-gray-800/50">
          <div className="flex items-center gap-3"><div className="bg-yellow-500/10 p-2 rounded-lg text-yellow-500"><Newspaper size={20} /></div><div><p className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">Avisos</p><p className="text-sm font-medium text-white truncate max-w-[200px]">{NEWS_FEED[0].title}</p></div></div><ChevronUp size={20} className={`text-gray-500 transition-transform ${showNews ? 'rotate-180' : ''}`} />
        </div>
        {showNews && (<div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-4rem)]">{NEWS_FEED.map(news => (<div key={news.id} className="bg-gray-800 p-4 rounded-xl border-l-4 border-yellow-500 shadow-lg"><div className="flex justify-between items-start mb-2"><span className="bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{news.type}</span><span className="text-gray-500 text-xs">{news.time}</span></div><h3 className="font-bold text-white mb-1">{news.title}</h3><p className="text-gray-400 text-sm leading-relaxed">{news.body}</p></div>))}</div>)}
      </div>

      {showModal && <ReportModal onClose={() => { setShowModal(false); setTempMarkerPos(null); }} onSubmit={handleSubmitAlert} trustStatus={getTrustStatus(userData?.trust_score || 100)} isOnline={isOnline} />}
    </div>
  );
}