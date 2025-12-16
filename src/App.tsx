import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  MapPin, Lightbulb, CheckCircle, Clock, AlertTriangle, User, Navigation, 
  Plus, Search, Camera, X, FileText, Bell, Filter, TrendingUp, Calendar, 
  Eye, MessageSquare, Phone, Mail, Download, BarChart3, Users, 
  Plus as PlusIcon, Minus as MinusIcon, Crosshair, MapPinned
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- INTERFACES TYPESCRIPT ---
interface TimelineItem {
  date: string;
  time?: string;
  title?: string;
  action?: string;
  description?: string;
  user?: string;
  icon?: string;
}

interface Request {
  id: number;
  protocol: string;
  type: string;
  address: string;
  status: string;
  priority: string;
  lat: number;
  lng: number;
  date: string;
  citizenName: string;
  citizenEmail: string;
  citizenPhone: string;
  description: string;
  timeline: TimelineItem[];
  team?: string;
  estimatedTime?: string;
}

interface UserData {
  id: number;
  name: string;
  email: string;
  phone: string;
  password: string;
  type: 'citizen' | 'admin';
}

interface Notification {
  id: number;
  message: string;
  date?: string;
  time?: string;
  read: boolean;
}

interface Coords {
  lat: number;
  lng: number;
}

interface LocationSuggestion {
  name: string;
  lat: number;
  lng: number;
}

// --- FUNÇÕES AUXILIARES ---
const getStatusColor = (status: string): string => {
  switch(status) {
    case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'progress': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'done': return 'bg-green-100 text-green-700 border-green-200';
    case 'cancelled': return 'bg-gray-100 text-gray-700 border-gray-200';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const getStatusText = (status: string): string => {
  switch(status) {
    case 'pending': return 'Aguardando';
    case 'progress': return 'Em Atendimento';
    case 'done': return 'Concluído';
    case 'cancelled': return 'Cancelado';
    default: return status;
  }
};

const getPriorityColor = (priority: string): string => {
  switch(priority) {
    case 'critical': return 'bg-red-500 text-white';
    case 'high': return 'bg-orange-500 text-white';
    case 'medium': return 'bg-yellow-500 text-white';
    case 'low': return 'bg-green-500 text-white';
    default: return 'bg-gray-500 text-white';
  }
};

const getPriorityText = (priority: string): string => {
  switch(priority) {
    case 'critical': return 'Crítico';
    case 'high': return 'Alta';
    case 'medium': return 'Média';
    case 'low': return 'Baixa';
    default: return priority;
  }
};

// --- PROPS DOS COMPONENTES ---
interface InteractiveMapProps {
  requests: Request[];
  onMarkerClick: (req: Request) => void;
  onMapClick: (coords: Coords) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  onCenterOnLocation?: (coords: Coords) => void;
  highlightedRequest?: number | null;
}

// Ícones personalizados para os marcadores do Leaflet
const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: ${color};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">
        <div style="
          width: 10px;
          height: 10px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const getMarkerColor = (req: Request): string => {
  if (req.priority === 'critical') return '#dc2626';
  if (req.status === 'done') return '#16a34a';
  if (req.status === 'progress') return '#2563eb';
  return '#eab308';
};

// Componente para controlar o mapa
const MapController = ({ 
  center, 
  zoom, 
  onZoomChange,
  onMapClick 
}: { 
  center: [number, number]; 
  zoom: number; 
  onZoomChange: (z: number) => void;
  onMapClick: (coords: Coords) => void;
}) => {
  const map = useMap();
  const prevCenterRef = useRef<[number, number]>(center);
  const prevZoomRef = useRef<number>(zoom);
  
  useEffect(() => {
    // Só atualiza se houve mudança real
    const centerChanged = prevCenterRef.current[0] !== center[0] || prevCenterRef.current[1] !== center[1];
    const zoomChanged = prevZoomRef.current !== zoom;
    
    if (centerChanged || zoomChanged) {
      map.setView(center, zoom, { animate: true });
      prevCenterRef.current = center;
      prevZoomRef.current = zoom;
    }
  }, [center, zoom, map]);

  useMapEvents({
    zoomend: () => {
      const newZoom = map.getZoom();
      if (newZoom !== prevZoomRef.current) {
        onZoomChange(newZoom);
      }
    },
    click: (e) => {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
  });

  return null;
};

// --- COMPONENTE DE MAPA COM LEAFLET/OSM ---
const InteractiveMap = ({ 
  requests, 
  onMarkerClick, 
  onMapClick, 
  zoom, 
  onZoomChange, 
  searchTerm = '',
  onSearchChange,
  highlightedRequest
}: InteractiveMapProps) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-5.3686, -49.1178]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Centro de Marabá
  const CENTER_LAT = -5.3686;
  const CENTER_LNG = -49.1178;

  // Centralizar mapa em uma localização específica
  const centerOnCoords = useCallback((lat: number, lng: number) => {
    setMapCenter([lat, lng]);
  }, []);

  // Centralizar no centro de Marabá
  const centerOnMaraba = useCallback(() => {
    setMapCenter([CENTER_LAT, CENTER_LNG]);
    onZoomChange(14);
  }, [onZoomChange]);

  // Efeito para centralizar quando highlightedRequest muda
  useEffect(() => {
    if (highlightedRequest) {
      const req = requests.find(r => r.id === highlightedRequest);
      if (req) {
        centerOnCoords(req.lat, req.lng);
        onZoomChange(16);
      }
    }
  }, [highlightedRequest, centerOnCoords, onZoomChange]);

  // Sugestões de busca filtradas
  const searchSuggestions = searchTerm && searchTerm.length > 0 
    ? requests.filter((req: Request) => 
        req.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.protocol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.type.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 5)
    : [];

  // Bairros conhecidos de Marabá para sugestões
  const knownLocations: LocationSuggestion[] = [
    { name: 'Nova Marabá', lat: -5.3686, lng: -49.1178 },
    { name: 'Cidade Nova', lat: -5.3588, lng: -49.1289 },
    { name: 'Velha Marabá', lat: -5.3450, lng: -49.1150 },
    { name: 'Amapá', lat: -5.3480, lng: -49.1045 },
    { name: 'São Félix', lat: -5.3750, lng: -49.0950 },
    { name: 'Morada Nova', lat: -5.3820, lng: -49.1300 },
    { name: 'Folha 32', lat: -5.3700, lng: -49.1200 },
    { name: 'Folha 17', lat: -5.3725, lng: -49.1134 },
  ];

  const locationSuggestions = searchTerm && searchTerm.length > 0 && searchSuggestions.length === 0
    ? knownLocations.filter((loc: LocationSuggestion) => 
        loc.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  const handleSearchSelect = (item: Request | LocationSuggestion) => {
    if ('lat' in item && 'lng' in item) {
      centerOnCoords(item.lat, item.lng);
      onZoomChange(17);
    }
    if ('protocol' in item) {
      onMarkerClick(item as Request);
    }
    setShowSuggestions(false);
    if (onSearchChange) {
      onSearchChange('name' in item ? item.name : (item as Request).address || '');
    }
  };

  return (
    <div className="w-full h-full relative">
      {/* Mapa Leaflet com OpenStreetMap */}
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        className="w-full h-full z-0"
        zoomControl={false}
        style={{ background: '#e2e8f0' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController 
          center={mapCenter} 
          zoom={zoom} 
          onZoomChange={onZoomChange}
          onMapClick={onMapClick}
        />

        {/* Marcadores das solicitações */}
        {requests.map((req: Request) => (
          <Marker
            key={req.id}
            position={[req.lat, req.lng]}
            icon={createCustomIcon(getMarkerColor(req))}
            eventHandlers={{
              click: () => onMarkerClick(req)
            }}
          >
            <Popup>
              <div className="p-2 min-w-50">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColor(req.status)}`}>
                    {getStatusText(req.status)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getPriorityColor(req.priority)}`}>
                    {getPriorityText(req.priority)}
                  </span>
                </div>
                <h3 className="font-bold text-slate-800 text-sm">{req.type}</h3>
                <p className="text-xs text-slate-600 mt-1">{req.address}</p>
                <p className="text-xs text-slate-500 mt-1">Protocolo: {req.protocol}</p>
                <button 
                  onClick={() => onMarkerClick(req)}
                  className="mt-2 w-full bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold py-1.5 px-3 rounded transition"
                >
                  Ver Detalhes
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Barra de Busca com Sugestões */}
      <div className="absolute top-4 left-4 right-20 z-1000">
        <div className="max-w-lg mx-auto">
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center p-3">
              <Search className="text-slate-400 w-5 h-5 ml-2" />
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Buscar endereço, bairro, protocolo..."
                className="flex-1 ml-3 outline-none text-slate-700 bg-transparent text-sm"
                value={searchTerm}
                onChange={(e) => {
                  onSearchChange?.(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />
              {searchTerm && (
                <button 
                  onClick={() => {
                    onSearchChange?.('');
                    setShowSuggestions(false);
                  }}
                  className="p-1 hover:bg-slate-100 rounded-full"
                >
                  <X size={16} className="text-slate-400" />
                </button>
              )}
            </div>

            {/* Sugestões de Busca */}
            {showSuggestions && (searchSuggestions.length > 0 || locationSuggestions.length > 0) && (
              <div className="border-t border-slate-200 max-h-64 overflow-y-auto">
                {searchSuggestions.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                      Solicitações
                    </div>
                    {searchSuggestions.map((req: Request) => (
                      <button
                        key={req.id}
                        onClick={() => handleSearchSelect(req)}
                        className="w-full px-4 py-3 hover:bg-yellow-50 flex items-start gap-3 text-left transition"
                      >
                        <MapPin size={16} className={`mt-0.5 ${
                          req.priority === 'critical' ? 'text-red-500' :
                          req.status === 'done' ? 'text-green-500' : 'text-yellow-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{req.address}</p>
                          <p className="text-xs text-slate-500">{req.protocol} • {req.type}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(req.status)}`}>
                          {getStatusText(req.status)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {locationSuggestions.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                      Bairros de Marabá
                    </div>
                    {locationSuggestions.map((loc: LocationSuggestion) => (
                      <button
                        key={loc.name}
                        onClick={() => handleSearchSelect(loc)}
                        className="w-full px-4 py-3 hover:bg-yellow-50 flex items-center gap-3 text-left transition"
                      >
                        <MapPinned size={16} className="text-blue-500" />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{loc.name}</p>
                          <p className="text-xs text-slate-500">Marabá, PA</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controles de Zoom */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 flex flex-col z-1000">
        <button
          onClick={() => onZoomChange(Math.min(zoom + 1, 18))}
          className="p-3 border-b border-slate-200 hover:bg-slate-100 text-slate-700 transition"
          title="Aumentar zoom"
        >
          <PlusIcon size={20} />
        </button>
        
        <div className="px-3 py-2 text-center border-b border-slate-200 bg-slate-50">
          <span className="text-xs font-bold text-slate-600">{Math.round(zoom)}x</span>
        </div>
        
        <button
          onClick={() => onZoomChange(Math.max(zoom - 1, 10))}
          className="p-3 border-b border-slate-200 hover:bg-slate-100 text-slate-700 transition"
          title="Diminuir zoom"
        >
          <MinusIcon size={20} />
        </button>
        
        <button
          onClick={centerOnMaraba}
          className="p-3 hover:bg-slate-100 text-slate-700 transition"
          title="Centralizar em Marabá"
        >
          <Crosshair size={20} />
        </button>
      </div>

      {/* Legenda do Mapa */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-3 z-1000">
        <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
          <MapPin size={12} /> Legenda
        </h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-slate-600">Crítico</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span className="text-slate-600">Pendente</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-slate-600">Em Atendimento</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-slate-600">Resolvido</span>
          </div>
        </div>
      </div>

      {/* Contador de Marcadores */}
      <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 px-4 py-2 z-1000">
        <span className="text-xs font-bold text-slate-600">
          {requests.length} ocorrências
        </span>
      </div>

      {/* Dica de Interação */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-slate-900/80 text-white text-xs px-4 py-2 rounded-full backdrop-blur pointer-events-none z-1000">
        🖱️ Arraste para mover • Scroll para zoom • Clique para reportar
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---
const SGIApp = () => {
  // Funções helper para localStorage
  const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Erro ao carregar ${key}:`, error);
      return defaultValue;
    }
  };

  const saveToStorage = <T,>(key: string, value: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Erro ao salvar ${key}:`, error);
    }
  };

  const [currentView, setCurrentView] = useState<'login' | 'citizen' | 'admin'>(() => 
    loadFromStorage('sgi_currentView', 'login')
  );
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [activeTab, setActiveTab] = useState('map');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [mapSearchTerm, setMapSearchTerm] = useState('');
  const [currentUser, setCurrentUser] = useState<UserData>(() => 
    loadFromStorage('sgi_currentUser', { id: 0, name: '', email: '', phone: '', password: '', type: 'citizen' as const })
  );
  const [showFilters, setShowFilters] = useState(false);
  const [mapZoom, setMapZoom] = useState(13);
  const [highlightedRequest, setHighlightedRequest] = useState<number | null>(null);

  // Estado temporário para novo ponto no mapa
  const [newPointCoords, setNewPointCoords] = useState<Coords | null>(null);

  const [users, setUsers] = useState<UserData[]>(() => 
    loadFromStorage('sgi_users', [
      { id: 1, email: 'maria.silva@email.com', password: '123456', name: 'Maria Silva', phone: '(94) 98765-4321', type: 'citizen' as const },
      { id: 2, email: 'admin@maraba.pa.gov.br', password: 'admin123', name: 'Administrador', phone: '(94) 3324-0000', type: 'admin' as const },
    ])
  );

  const [requests, setRequests] = useState<Request[]>(() => 
    loadFromStorage('sgi_requests', [
    { 
      id: 1, 
      protocol: '2025-0001-LP',
      type: 'Lâmpada Queimada', 
      address: 'Av. VP8, Folha 32 - Nova Marabá', 
      status: 'pending', 
      priority: 'medium',
      lat: -5.3686, 
      lng: -49.1178, 
      date: '14/12/2025',
      citizenName: 'João Santos',
      citizenEmail: 'joao@email.com',
      citizenPhone: '(94) 99999-8888',
      description: 'Lâmpada LED queimada há 3 dias, escuro à noite.',
      timeline: [
        { date: '14/12/2025', time: '14:30', title: 'Solicitação Recebida', description: 'Protocolo gerado automaticamente', icon: 'FileText' }
      ]
    },
    { 
      id: 2, 
      protocol: '2025-0002-LP',
      type: 'Poste Piscando', 
      address: 'Rua Nagib Mutran - Cidade Nova', 
      status: 'progress', 
      priority: 'high',
      lat: -5.3588, 
      lng: -49.1289, 
      date: '12/12/2025',
      citizenName: 'Maria Silva',
      citizenEmail: 'maria.silva@email.com',
      citizenPhone: '(94) 98765-4321',
      description: 'Poste piscando intermitentemente, possível problema elétrico.',
      team: 'Equipe Alpha',
      estimatedTime: '2 horas',
      timeline: [
        { date: '12/12/2025', time: '09:15', title: 'Solicitação Recebida', description: 'Protocolo gerado automaticamente', icon: 'FileText' },
        { date: '12/12/2025', time: '10:00', title: 'Em Análise', description: 'Solicitação avaliada pela equipe técnica', icon: 'Search' },
        { date: '14/12/2025', time: '08:00', title: 'Equipe Despachada', description: 'Equipe Alpha a caminho do local', icon: 'Navigation' }
      ]
    },
    { 
      id: 3, 
      protocol: '2025-0003-LP',
      type: 'Lâmpada Acesa de Dia', 
      address: 'Folha 17, Quadra Especial - Nova Marabá', 
      status: 'done', 
      priority: 'low',
      lat: -5.3725, 
      lng: -49.1134, 
      date: '10/12/2025',
      citizenName: 'Carlos Mendes',
      citizenEmail: 'carlos@email.com',
      citizenPhone: '(94) 97777-6666',
      description: 'Lâmpada fica acesa durante o dia, desperdício de energia.',
      team: 'Equipe Beta',
      timeline: [
        { date: '10/12/2025', time: '11:20', title: 'Solicitação Recebida', description: 'Protocolo gerado automaticamente', icon: 'FileText' },
        { date: '10/12/2025', time: '14:00', title: 'Em Análise', description: 'Solicitação avaliada pela equipe técnica', icon: 'Search' },
        { date: '11/12/2025', time: '09:30', title: 'Equipe Despachada', description: 'Equipe Beta a caminho do local', icon: 'Navigation' },
        { date: '11/12/2025', time: '11:45', title: 'Serviço Concluído', description: 'Fotocélula substituída com sucesso', icon: 'CheckCircle' }
      ]
    },
    { 
      id: 4, 
      protocol: '2025-0004-LP',
      type: 'Poste Danificado', 
      address: 'Av. Transamazônica - Amapá', 
      status: 'pending', 
      priority: 'critical',
      lat: -5.3480, 
      lng: -49.1045, 
      date: '14/12/2025',
      citizenName: 'Ana Paula',
      citizenEmail: 'ana@email.com',
      citizenPhone: '(94) 96666-5555',
      description: 'Poste inclinado após acidente, risco de queda.',
      timeline: [
        { date: '14/12/2025', time: '16:45', title: 'Solicitação Recebida', description: 'Protocolo de EMERGÊNCIA gerado', icon: 'AlertTriangle' }
      ]
    },
    { 
      id: 5, 
      protocol: '2025-0005-LP',
      type: 'Lâmpada Queimada', 
      address: 'Folha 26, Quadra 07 - Nova Marabá', 
      status: 'done', 
      priority: 'medium',
      lat: -5.3650, 
      lng: -49.1200, 
      date: '08/12/2025',
      citizenName: 'Pedro Costa',
      citizenEmail: 'pedro@email.com',
      citizenPhone: '(94) 95555-4444',
      description: 'Lâmpada apagada na frente de estabelecimento comercial.',
      team: 'Equipe Gamma',
      timeline: [
        { date: '08/12/2025', time: '13:10', title: 'Solicitação Recebida', description: 'Protocolo gerado automaticamente', icon: 'FileText' },
        { date: '08/12/2025', time: '15:30', title: 'Em Análise', description: 'Solicitação avaliada pela equipe técnica', icon: 'Search' },
        { date: '09/12/2025', time: '10:00', title: 'Equipe Despachada', description: 'Equipe Gamma a caminho do local', icon: 'Navigation' },
        { date: '09/12/2025', time: '12:20', title: 'Serviço Concluído', description: 'Lâmpada LED substituída', icon: 'CheckCircle' }
      ]
    }
  ])
  );

  const [notifications, setNotifications] = useState<Notification[]>(() => 
    loadFromStorage('sgi_notifications', [
    { id: 1, message: 'Sua solicitação #2025-0002-LP foi atualizada: Equipe a caminho', date: '14/12 08:00', read: false },
    { id: 2, message: 'Manutenção concluída próximo à sua localização', date: '11/12 11:45', read: false },
    { id: 3, message: 'Lembrete: Avalie nosso atendimento', date: '09/12 15:30', read: true }
  ])
  );

  // Persistir dados no localStorage
  useEffect(() => {
    saveToStorage('sgi_users', users);
  }, [users]);

  useEffect(() => {
    saveToStorage('sgi_requests', requests);
  }, [requests]);

  useEffect(() => {
    saveToStorage('sgi_notifications', notifications);
  }, [notifications]);

  useEffect(() => {
    saveToStorage('sgi_currentUser', currentUser);
  }, [currentUser]);

  useEffect(() => {
    saveToStorage('sgi_currentView', currentView);
  }, [currentView]);

  const handleLogin = (email: string, password: string, type: 'citizen' | 'admin'): boolean => {
    const user = users.find(u => u.email === email && u.password === password && u.type === type);
    if (user) {
      setCurrentUser(user);
      setCurrentView(type);
      return true;
    }
    return false;
  };

  const handleRegister = (name: string, email: string, phone: string, password: string, type: 'citizen' | 'admin'): { success: boolean; message?: string } => {
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return { success: false, message: 'E-mail já cadastrado!' };
    }

    const newUser: UserData = { id: users.length + 1, email, password, name, phone, type };
    setUsers([...users, newUser]);
    setCurrentUser(newUser);
    setCurrentView(type);
    return { success: true, message: 'Cadastro realizado com sucesso!' };
  };

  const filteredRequests = requests.filter(req => {
    const matchesStatus = filterStatus === 'all' || req.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || req.priority === filterPriority;
    const matchesSearch = req.address.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          req.protocol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          req.type.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const myRequests = requests.filter(req => req.citizenEmail === currentUser.email);

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    progress: requests.filter(r => r.status === 'progress').length,
    done: requests.filter(r => r.status === 'done').length,
    critical: requests.filter(r => r.priority === 'critical').length,
    avgTime: '24h',
    sla: 89
  };

  const handleNewRequest = (data: { type: string; description?: string }) => {
    const newRequest: Request = {
      id: requests.length + 1,
      protocol: `2025-${String(requests.length + 1).padStart(4, '0')}-LP`,
      type: data.type,
      address: newPointCoords ? `Local no Mapa (${newPointCoords.lat.toFixed(4)}, ${newPointCoords.lng.toFixed(4)})` : 'Av. VP8, Folha 32 - Nova Marabá',
      status: 'pending',
      priority: data.type === 'Poste Danificado' ? 'critical' : 'medium',
      lat: newPointCoords ? newPointCoords.lat : -5.3686,
      lng: newPointCoords ? newPointCoords.lng : -49.1178,
      date: new Date().toLocaleDateString('pt-BR'),
      citizenName: currentUser.name,
      citizenEmail: currentUser.email,
      citizenPhone: currentUser.phone,
      description: data.description || '',
      timeline: [
        { 
          date: new Date().toLocaleDateString('pt-BR'), 
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), 
          title: 'Solicitação Recebida', 
          description: 'Protocolo gerado automaticamente', 
          icon: 'FileText' 
        }
      ]
    };
    
    setRequests([...requests, newRequest]);
    setSelectedRequest(newRequest);
    setShowNewRequestModal(false);
    setShowProtocolModal(true);
    setNewPointCoords(null); // Resetar coordenadas temporárias

    const newNotification = {
      id: notifications.length + 1,
      message: `Nova solicitação criada: ${newRequest.protocol}`,
      date: `${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      read: false
    };
    setNotifications([newNotification, ...notifications]);
  };

  const markNotificationAsRead = (id: number) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleLogout = () => {
    setCurrentView('login');
    setCurrentUser({ id: 0, name: '', email: '', phone: '', password: '', type: 'citizen' });
    setActiveTab('map');
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // --- HEADER COMPONENT ---
  const Header = ({ role }: { role: string }) => (
    <header className="bg-slate-900 text-white p-4 shadow-lg z-50 relative">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-500/20 p-2 rounded-lg border border-yellow-500/50">
            <Lightbulb className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <span className="font-bold text-lg">SGI Cidade</span>
            <p className="text-xs text-slate-400 hidden sm:block">Iluminação Pública Inteligente</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 hover:bg-slate-800 rounded-lg transition"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </button>
          <div className="hidden sm:flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-lg">
            <User size={16} className="text-slate-400" />
            <span className="text-sm">{role}</span>
          </div>
          <button 
            onClick={handleLogout} 
            className="text-sm px-3 py-2 hover:bg-slate-800 rounded-lg transition"
          >
            Sair
          </button>
        </div>
      </div>

      {showNotifications && (
        <div className="absolute top-16 right-4 w-80 bg-white rounded-lg shadow-2xl border border-slate-200 z-50 max-h-96 overflow-y-auto">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Notificações</h3>
            <button 
              onClick={() => setNotifications(notifications.map(n => ({ ...n, read: true })))}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Marcar todas como lidas
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Bell className="mx-auto mb-2 opacity-50" size={32} />
                <p className="text-sm">Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div 
                  key={notif.id} 
                  onClick={() => markNotificationAsRead(notif.id)}
                  className={`p-3 hover:bg-slate-50 cursor-pointer transition ${!notif.read ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="flex gap-2">
                    {!notif.read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></div>}
                    <div className="flex-1">
                      <p className={`text-sm ${!notif.read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                        {notif.message}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">{notif.date}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </header>
  );

  // --- TELA DE LOGIN ---
  if (currentView === 'login') {
    return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} authMode={authMode} setAuthMode={setAuthMode} />;
  }

  // --- VISÃO CIDADÃO ---
  if (currentView === 'citizen') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
        <Header role={currentUser.name} />
        
        {/* Tabs */}
        <div className="bg-white border-b border-slate-200 px-4">
          <div className="max-w-4xl mx-auto flex gap-1">
            <button 
              onClick={() => setActiveTab('map')}
              className={`px-4 py-3 font-medium text-sm transition border-b-2 ${activeTab === 'map' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-slate-600 hover:text-slate-800'}`}
            >
              <MapPin className="inline w-4 h-4 mr-1" />
              Reportar Problema
            </button>
            <button 
              onClick={() => setActiveTab('my-requests')}
              className={`px-4 py-3 font-medium text-sm transition border-b-2 ${activeTab === 'my-requests' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-slate-600 hover:text-slate-800'}`}
            >
              <FileText className="inline w-4 h-4 mr-1" />
              Minhas Solicitações
              {myRequests.length > 0 && (
                <span className="ml-2 bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-bold">
                  {myRequests.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab: Mapa */}
        {activeTab === 'map' && (
          <div className="flex-1 relative overflow-hidden">
            {/* Mapa Dinâmico */}
            <div className="absolute inset-0 z-0">
              <InteractiveMap 
                requests={requests} 
                onMarkerClick={(req) => {
                  setSelectedRequest(req);
                  setShowProtocolModal(true);
                }}
                onMapClick={(coords) => {
                  if (confirm("Deseja reportar um problema neste local?")) {
                    setNewPointCoords(coords);
                    setShowNewRequestModal(true);
                  }
                }}
                zoom={mapZoom}
                onZoomChange={setMapZoom}
                searchTerm={mapSearchTerm}
                onSearchChange={setMapSearchTerm}
                highlightedRequest={highlightedRequest}
                onCenterOnLocation={() => {
                  // Centraliza no local buscado
                  setMapZoom(15);
                }}
              />
            </div>

            {/* Interface Flutuante Sobre o Mapa */}
            <div className="absolute bottom-0 w-full z-10 p-4 bg-linear-to-t from-slate-900/90 via-slate-900/50 to-transparent pt-32 pointer-events-none">
              <div className="max-w-md mx-auto pointer-events-auto space-y-3">
                <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="bg-yellow-100 p-2 rounded-lg">
                      <Lightbulb className="text-yellow-600 w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-800 text-sm">Ajude a Iluminar Nossa Cidade</h3>
                      <p className="text-xs text-slate-600 mt-1">
                        Arraste o mapa e clique para reportar problemas de iluminação.
                      </p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setShowNewRequestModal(true)}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-4 rounded-xl shadow-xl flex items-center justify-center gap-2 text-lg transform transition active:scale-95"
                >
                  <Plus size={24} /> Reportar Problema
                </button>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/95 backdrop-blur-sm rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-600">{stats.done}</div>
                    <div className="text-xs text-slate-600">Resolvidos</div>
                  </div>
                  <div className="bg-white/95 backdrop-blur-sm rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-600">{stats.progress}</div>
                    <div className="text-xs text-slate-600">Em Andamento</div>
                  </div>
                  <div className="bg-white/95 backdrop-blur-sm rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{stats.avgTime}</div>
                    <div className="text-xs text-slate-600">Tempo Médio</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Barra de Busca Flutuante */}
            <div className="absolute top-4 left-4 right-4 z-10">
              <div className="max-w-md mx-auto bg-white/95 backdrop-blur-sm rounded-full shadow-lg flex items-center p-3">
                <Search className="text-slate-400 w-5 h-5 ml-2" />
                <input 
                  type="text" 
                  placeholder="Buscar solicitações por endereço, protocolo ou tipo..."
                  className="flex-1 ml-2 outline-none text-slate-700 bg-transparent text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab: Minhas Solicitações */}
        {activeTab === 'my-requests' && (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800">Minhas Solicitações</h2>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm"
                >
                  <Filter size={16} />
                  Filtros
                </button>
              </div>

              {showFilters && (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">Status</label>
                    <div className="flex gap-2 flex-wrap">
                      {['all', 'pending', 'progress', 'done'].map(status => (
                        <button
                          key={status}
                          onClick={() => setFilterStatus(status)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                            filterStatus === status 
                              ? 'bg-yellow-500 text-white' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {status === 'all' ? 'Todos' : getStatusText(status)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">Prioridade</label>
                    <div className="flex gap-2 flex-wrap">
                      {['all', 'critical', 'high', 'medium', 'low'].map(priority => (
                        <button
                          key={priority}
                          onClick={() => setFilterPriority(priority)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                            filterPriority === priority 
                              ? 'bg-yellow-500 text-white' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {priority === 'all' ? 'Todas' : getPriorityText(priority)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {myRequests.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
                  <FileText className="mx-auto text-slate-300 mb-3" size={48} />
                  <h3 className="font-bold text-slate-800 mb-1">Nenhuma solicitação ainda</h3>
                  <p className="text-slate-600 text-sm mb-4">Comece reportando um problema de iluminação.</p>
                  <button 
                    onClick={() => setActiveTab('map')}
                    className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-2 px-6 rounded-lg"
                  >
                    Reportar Problema
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {myRequests.map(req => (
                    <div 
                      key={req.id} 
                      onClick={() => {
                        setSelectedRequest(req);
                        setShowProtocolModal(true);
                        setHighlightedRequest(req.id);
                      }}
                      className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 hover:shadow-md hover:border-yellow-300 cursor-pointer transition"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                              {req.protocol}
                            </span>
                            <span className={`text-xs font-bold px-2 py-1 rounded border ${getStatusColor(req.status)}`}>
                              {getStatusText(req.status)}
                            </span>
                          </div>
                          <h3 className="font-bold text-slate-800">{req.type}</h3>
                          <p className="text-sm text-slate-600 flex items-center gap-1 mt-1">
                            <MapPin size={14} className="text-slate-400" />
                            {req.address}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${getPriorityColor(req.priority)}`}>
                          {getPriorityText(req.priority)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Calendar size={12} />
                          {req.date}
                        </span>
                        <button className="text-xs text-yellow-600 font-medium hover:text-yellow-700 flex items-center gap-1">
                          Ver Detalhes
                          <Eye size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {showNewRequestModal && (
          <NewRequestModal 
            onClose={() => setShowNewRequestModal(false)}
            onSubmit={handleNewRequest}
            coords={newPointCoords}
          />
        )}

        {showProtocolModal && selectedRequest && (
          <ProtocolModal 
            request={selectedRequest}
            onClose={() => {
              setShowProtocolModal(false);
              setSelectedRequest(null);
            }}
          />
        )}
      </div>
    );
  }

  // --- VISÃO GESTOR/ADMIN ---
  if (currentView === 'admin') {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
        <Header role="Gestor" />
        
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r border-slate-200 hidden lg:block overflow-y-auto">
            <div className="p-4 space-y-6">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 px-2">Dashboard</h3>
                <div className="space-y-1">
                  <button className="w-full text-left px-3 py-2 bg-yellow-50 text-yellow-700 font-medium rounded-lg flex items-center gap-2">
                    <MapPin size={16} /> Mapa Geral
                  </button>
                  <button className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg flex items-center gap-2">
                    <BarChart3 size={16} /> Relatórios
                  </button>
                  <button className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg flex items-center gap-2">
                    <Users size={16} /> Equipes
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 px-2">Filtros Rápidos</h3>
                <div className="space-y-1">
                  <button 
                    onClick={() => setFilterStatus('all')}
                    className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg flex items-center justify-between text-sm"
                  >
                    <span>Todas</span>
                    <span className="bg-slate-200 px-2 py-0.5 rounded-full text-xs font-bold">{stats.total}</span>
                  </button>
                  <button 
                    onClick={() => setFilterStatus('pending')}
                    className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-yellow-500" />
                      Pendentes
                    </span>
                    <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-bold">{stats.pending}</span>
                  </button>
                  <button 
                    onClick={() => setFilterStatus('progress')}
                    className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Clock size={14} className="text-blue-500" />
                      Em Andamento
                    </span>
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">{stats.progress}</span>
                  </button>
                  <button 
                    onClick={() => setFilterStatus('done')}
                    className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-green-500" />
                      Concluídos
                    </span>
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">{stats.done}</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 px-2">Prioridade</h3>
                <div className="space-y-1">
                  <button 
                    onClick={() => setFilterPriority('critical')}
                    className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      Crítico
                    </span>
                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">{stats.critical}</span>
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* Stats Bar */}
            <div className="bg-white p-4 shadow-sm border-b border-slate-200">
              <div className="flex justify-between items-center gap-4 overflow-x-auto pb-2">
                <div className="flex items-center gap-3 min-w-max">
                  <div className="bg-red-100 p-3 rounded-lg">
                    <AlertTriangle className="text-red-600 w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
                    <div className="text-xs text-slate-500">Ocorrências Críticas</div>
                  </div>
                </div>
                
                <div className="h-12 w-px bg-slate-200"></div>
                
                <div className="flex items-center gap-3 min-w-max">
                  <div className="bg-yellow-100 p-3 rounded-lg">
                    <Clock className="text-yellow-600 w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                    <div className="text-xs text-slate-500">Aguardando Atendimento</div>
                  </div>
                </div>
                
                <div className="h-12 w-px bg-slate-200"></div>
                
                <div className="flex items-center gap-3 min-w-max">
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <Navigation className="text-blue-600 w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{stats.progress}</div>
                    <div className="text-xs text-slate-500">Equipes em Campo</div>
                  </div>
                </div>
                
                <div className="h-12 w-px bg-slate-200"></div>
                
                <div className="flex items-center gap-3 min-w-max">
                  <div className="bg-green-100 p-3 rounded-lg">
                    <TrendingUp className="text-green-600 w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{stats.sla}%</div>
                    <div className="text-xs text-slate-500">Taxa de SLA</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Map View */}
            <div className="flex-1 relative bg-slate-100">
              <InteractiveMap 
                requests={filteredRequests} 
                onMarkerClick={(req) => {
                  setSelectedRequest(req);
                  setShowProtocolModal(true);
                }}
                onMapClick={() => {}} // Admin não cria reportes pelo mapa
                zoom={mapZoom}
                onZoomChange={setMapZoom}
                searchTerm={mapSearchTerm}
                onSearchChange={setMapSearchTerm}
                highlightedRequest={highlightedRequest}
                onCenterOnLocation={() => setMapZoom(15)}
              />
              
              {/* Painel Flutuante de Tarefas */}
              <div className="absolute top-4 right-4 w-96 bg-white rounded-lg shadow-xl border border-slate-200 max-h-[calc(100vh-180px)] flex flex-col z-20">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Clock size={18} className="text-yellow-600" />
                    Fila de Atendimento
                  </h3>
                  <div className="flex gap-2">
                    <button className="p-1.5 hover:bg-slate-100 rounded">
                      <Filter size={16} className="text-slate-600" />
                    </button>
                    <button className="p-1.5 hover:bg-slate-100 rounded">
                      <Download size={16} className="text-slate-600" />
                    </button>
                  </div>
                </div>

                <div className="p-3 border-b border-slate-200">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      placeholder="Buscar por protocolo ou endereço..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-yellow-400 focus:bg-white"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredRequests.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <FileText className="mx-auto mb-2" size={32} />
                      <p className="text-sm">Nenhuma solicitação encontrada</p>
                    </div>
                  ) : (
                    filteredRequests.map(req => (
                      <div 
                        key={req.id} 
                        onClick={() => {
                          setSelectedRequest(req);
                          setShowProtocolModal(true);
                        }}
                        className="border border-slate-200 rounded-lg p-3 hover:border-yellow-400 hover:shadow-md cursor-pointer transition bg-white"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-1 rounded border ${getStatusColor(req.status)}`}>
                              {getStatusText(req.status)}
                            </span>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${getPriorityColor(req.priority)}`}>
                              {getPriorityText(req.priority)}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400">{req.date}</span>
                        </div>
                        
                        <h4 className="font-bold text-sm text-slate-800 mb-1">{req.type}</h4>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                          <MapPin size={10} />
                          {req.address}
                        </p>
                        <div className="text-xs text-slate-600 mb-2">
                          <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{req.protocol}</span>
                        </div>

                        {req.team && (
                          <div className="text-xs text-blue-600 font-medium flex items-center gap-1">
                            <Navigation size={10} />
                            {req.team} - ETA: {req.estimatedTime}
                          </div>
                        )}
                        
                        {req.status === 'pending' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const updatedRequests = requests.map(r => 
                                r.id === req.id 
                                  ? { 
                                      ...r, 
                                      status: 'progress', 
                                      team: 'Equipe Delta',
                                      estimatedTime: '1.5 horas',
                                      timeline: [
                                        ...r.timeline,
                                        {
                                          date: new Date().toLocaleDateString('pt-BR'),
                                          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                                          title: 'Equipe Despachada',
                                          description: 'Equipe Delta a caminho do local',
                                          icon: 'Navigation'
                                        }
                                      ]
                                    } 
                                  : r
                              );
                              setRequests(updatedRequests);
                            }}
                            className="mt-2 w-full bg-slate-800 text-white text-xs py-2 rounded-lg hover:bg-slate-700 font-medium transition"
                          >
                            Despachar Equipe
                          </button>
                        )}

                        {req.status === 'progress' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const updatedRequests = requests.map(r => 
                                r.id === req.id 
                                  ? { 
                                      ...r, 
                                      status: 'done',
                                      timeline: [
                                        ...r.timeline,
                                        {
                                          date: new Date().toLocaleDateString('pt-BR'),
                                          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                                          title: 'Serviço Concluído',
                                          description: 'Manutenção realizada com sucesso',
                                          icon: 'CheckCircle'
                                        }
                                      ]
                                    } 
                                  : r
                              );
                              setRequests(updatedRequests);
                            }}
                            className="mt-2 w-full bg-green-600 text-white text-xs py-2 rounded-lg hover:bg-green-700 font-medium transition"
                          >
                            Marcar como Concluído
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Legenda do Mapa */}
              <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg border border-slate-200 p-3 z-20">
                <h4 className="text-xs font-bold text-slate-700 mb-2">Legenda</h4>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-slate-600">Crítico</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span className="text-slate-600">Alta Prioridade</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <span className="text-slate-600">Média Prioridade</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-slate-600">Resolvido</span>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>

        {showProtocolModal && selectedRequest && (
          <ProtocolModal 
            request={selectedRequest}
            onClose={() => {
              setShowProtocolModal(false);
              setSelectedRequest(null);
            }}
            isAdmin={true}
          />
        )}
      </div>
    );
  }

  return null;
};

// Interfaces para componentes auxiliares
interface LoginScreenProps {
  onLogin: (email: string, password: string, type: 'citizen' | 'admin') => boolean;
  onRegister: (name: string, email: string, phone: string, password: string, type: 'citizen' | 'admin') => { success: boolean; message?: string };
  authMode: 'login' | 'register';
  setAuthMode: (mode: 'login' | 'register') => void;
}

// Componente de Login/Cadastro
const LoginScreen = ({ onLogin, onRegister, authMode, setAuthMode }: LoginScreenProps) => {
  const [userType, setUserType] = useState<'citizen' | 'admin'>('citizen');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (authMode === 'login') {
      const success = onLogin(formData.email, formData.password, userType);
      if (!success) {
        setError('E-mail ou senha incorretos!');
      }
    } else {
      if (!formData.name || !formData.email || !formData.phone || !formData.password) {
        setError('Preencha todos os campos!');
        return;
      }

      if (formData.password.length < 6) {
        setError('A senha deve ter no mínimo 6 caracteres!');
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setError('As senhas não coincidem!');
        return;
      }

      const result = onRegister(formData.name, formData.email, formData.phone, formData.password, userType);
      if (!result.success) {
        setError(result.message || 'Erro ao cadastrar');
      }
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-10 left-10 w-64 h-64 bg-yellow-400 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-600 rounded-full blur-3xl"></div>
      </div>

      <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700 z-10">
        <div className="flex justify-center mb-6">
          <div className="bg-yellow-500/20 p-4 rounded-full border border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.5)]">
            <Lightbulb className="w-10 h-10 text-yellow-400" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-center text-white mb-2">SGI Marabá</h1>
        <p className="text-center text-slate-400 mb-8">Sistema de Gestão de Iluminação Pública</p>

        <div className="flex gap-2 mb-6 bg-slate-700 p-1 rounded-lg">
          <button
            onClick={() => {
              setAuthMode('login');
              setError('');
            }}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
              authMode === 'login'
                ? 'bg-yellow-500 text-slate-900'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Entrar
          </button>
          <button
            onClick={() => {
              setAuthMode('register');
              setError('');
            }}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
              authMode === 'register'
                ? 'bg-yellow-500 text-slate-900'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Cadastrar
          </button>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-3">Você é:</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setUserType('citizen')}
              className={`p-4 rounded-lg border-2 transition ${
                userType === 'citizen'
                  ? 'border-yellow-500 bg-yellow-500/10'
                  : 'border-slate-600 hover:border-slate-500'
              }`}
            >
              <User className={`mx-auto mb-2 ${userType === 'citizen' ? 'text-yellow-400' : 'text-slate-400'}`} size={24} />
              <p className={`text-sm font-medium ${userType === 'citizen' ? 'text-yellow-400' : 'text-slate-300'}`}>
                Cidadão
              </p>
            </button>
            <button
              type="button"
              onClick={() => setUserType('admin')}
              className={`p-4 rounded-lg border-2 transition ${
                userType === 'admin'
                  ? 'border-yellow-500 bg-yellow-500/10'
                  : 'border-slate-600 hover:border-slate-500'
              }`}
            >
              <Navigation className={`mx-auto mb-2 ${userType === 'admin' ? 'text-yellow-400' : 'text-slate-400'}`} size={24} />
              <p className={`text-sm font-medium ${userType === 'admin' ? 'text-yellow-400' : 'text-slate-300'}`}>
                Servidor Público
              </p>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {authMode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Nome Completo</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20"
                placeholder="Digite seu nome completo"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">E-mail</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20"
              placeholder={authMode === 'login' ? 'seu@email.com' : 'Digite seu e-mail'}
            />
          </div>

          {authMode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Telefone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20"
                placeholder="(94) 99999-9999"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20"
                placeholder={authMode === 'login' ? '••••••' : 'Mínimo 6 caracteres'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300"
              >
                <Eye size={20} />
              </button>
            </div>
          </div>

          {authMode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Confirmar Senha</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20"
                placeholder="Digite a senha novamente"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={20} />
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          {authMode === 'login' && (
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-400">
                <input type="checkbox" className="rounded" />
                <span>Lembrar de mim</span>
              </label>
              <button type="button" className="text-yellow-500 hover:text-yellow-400">
                Esqueceu a senha?
              </button>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-4 rounded-lg transition shadow-lg hover:shadow-xl"
          >
            {authMode === 'login' ? 'Entrar' : 'Criar Conta'}
          </button>
        </form>

        {authMode === 'login' && (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-xs text-slate-400 text-center mb-3">Credenciais para teste:</p>
            <div className="space-y-2 text-xs">
              <div className="bg-slate-700 p-3 rounded-lg">
                <p className="text-yellow-400 font-bold mb-1">👤 Cidadão:</p>
                <p className="text-slate-300">maria.silva@email.com / 123456</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-lg">
                <p className="text-blue-400 font-bold mb-1">🏛️ Servidor:</p>
                <p className="text-slate-300">admin@maraba.pa.gov.br / admin123</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Props para modal de nova solicitação
interface NewRequestModalProps {
  onClose: () => void;
  onSubmit: (data: { type: string; description?: string }) => void;
  coords: Coords | null;
}

// Componente Modal de Nova Solicitação
const NewRequestModal = ({ onClose, onSubmit, coords }: NewRequestModalProps) => {
  const [selectedType, setSelectedType] = useState('');
  const [description, setDescription] = useState('');

  const problemTypes = [
    { id: 'Lâmpada Queimada', label: 'Lâmpada Queimada', icon: '💡' },
    { id: 'Poste Piscando', label: 'Luz Piscando', icon: '⚡' },
    { id: 'Lâmpada Acesa de Dia', label: 'Acesa de Dia', icon: '☀️' },
    { id: 'Poste Danificado', label: 'Poste Danificado', icon: '🚨' }
  ];

  const handleSubmit = () => {
    if (!selectedType) {
      alert('Por favor, selecione o tipo de problema.');
      return;
    }
    onSubmit({ type: selectedType, description });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Nova Solicitação</h2>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-linear-to-r from-yellow-50 to-orange-50 border border-yellow-200 p-4 rounded-lg flex items-start gap-3">
            <MapPin className="text-yellow-600 shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-xs font-bold text-yellow-800 uppercase mb-1">Localização Detectada</p>
              <p className="font-semibold text-sm text-slate-800">
                {coords ? `Ponto no Mapa (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : 'Av. VP8, Folha 32 - Nova Marabá'}
              </p>
              <p className="text-xs text-slate-600 mt-1">Marabá, PA</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">
              Qual o problema? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {problemTypes.map((type) => (
                <button 
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={`border-2 p-4 rounded-xl text-sm font-medium transition text-left ${
                    selectedType === type.id 
                      ? 'bg-yellow-50 border-yellow-500 text-yellow-700 shadow-md' 
                      : 'border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="text-2xl mb-2">{type.icon}</div>
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Descrição adicional (opcional)
            </label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o problema com mais detalhes..."
              className="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 resize-none"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Foto do problema (opcional)
            </label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:bg-slate-50 hover:border-yellow-400 transition group">
              <Camera className="mx-auto text-slate-400 group-hover:text-yellow-600 mb-2 transition" size={32} />
              <p className="text-sm text-slate-600 font-medium">Clique para adicionar uma foto</p>
              <p className="text-xs text-slate-400 mt-1">PNG, JPG até 5MB</p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Phone className="text-blue-600" size={16} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-blue-800 uppercase mb-1">Informação Importante</p>
                <p className="text-xs text-slate-700">
                  Você receberá atualizações por e-mail e SMS sobre o andamento da sua solicitação.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              onClick={onClose}
              className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-lg hover:bg-slate-200 transition"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSubmit}
              disabled={!selectedType}
              className={`flex-1 font-bold py-3 rounded-lg transition ${
                selectedType 
                  ? 'bg-yellow-500 text-slate-900 hover:bg-yellow-400 shadow-lg' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              Enviar Solicitação
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Props para modal de protocolo
interface ProtocolModalProps {
  request: Request;
  onClose: () => void;
  isAdmin?: boolean;
}

// Componente Modal de Protocolo/Detalhes
const ProtocolModal = ({ request, onClose, isAdmin = false }: ProtocolModalProps) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-linear-to-r from-yellow-500 to-orange-500 text-white p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold mb-1">Protocolo #{request.protocol}</h2>
              <p className="text-yellow-100 text-sm">{request.type}</p>
            </div>
            <button onClick={onClose} className="p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition">
              <X size={20} />
            </button>
          </div>
          
          <div className="flex gap-3 flex-wrap">
            <span className={`px-3 py-1.5 rounded-lg font-bold text-sm ${getStatusColor(request.status)} bg-opacity-90`}>
              {getStatusText(request.status)}
            </span>
            <span className={`px-3 py-1.5 rounded-lg font-bold text-sm ${getPriorityColor(request.priority)}`}>
              Prioridade: {getPriorityText(request.priority)}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <FileText size={18} className="text-yellow-600" />
              Detalhes da Solicitação
            </h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="text-slate-400 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Localização</p>
                  <p className="text-sm font-semibold text-slate-800">{request.address}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="text-slate-400 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Data de Abertura</p>
                  <p className="text-sm font-semibold text-slate-800">{request.date}</p>
                </div>
              </div>
              {request.description && (
                <div className="flex items-start gap-3">
                  <MessageSquare className="text-slate-400 shrink-0 mt-0.5" size={18} />
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Descrição</p>
                    <p className="text-sm text-slate-700">{request.description}</p>
                  </div>
                </div>
              )}
              {request.team && (
                <div className="flex items-start gap-3">
                  <Navigation className="text-slate-400 shrink-0 mt-0.5" size={18} />
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Equipe Responsável</p>
                    <p className="text-sm font-semibold text-slate-800">{request.team}</p>
                    {request.estimatedTime && (
                      <p className="text-xs text-blue-600 mt-1">Tempo estimado: {request.estimatedTime}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Clock size={18} className="text-yellow-600" />
              Histórico de Atendimento
            </h3>
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200"></div>
              
              {request.timeline.map((event: TimelineItem, index: number) => {
                const IconComponent = event.icon === 'FileText' ? FileText :
                                     event.icon === 'Search' ? Search :
                                     event.icon === 'Navigation' ? Navigation :
                                     event.icon === 'CheckCircle' ? CheckCircle :
                                     event.icon === 'AlertTriangle' ? AlertTriangle :
                                     Clock;
                
                const isLast = index === request.timeline.length - 1;
                
                return (
                  <div key={index} className="relative">
                    <div className={`absolute -left-6 w-4 h-4 rounded-full border-2 border-white ${
                      isLast ? 'bg-yellow-500' : 'bg-slate-300'
                    }`}></div>
                    <div className={`bg-white border ${isLast ? 'border-yellow-200 shadow-md' : 'border-slate-200'} rounded-lg p-3`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${isLast ? 'bg-yellow-100' : 'bg-slate-100'}`}>
                          <IconComponent className={isLast ? 'text-yellow-600' : 'text-slate-600'} size={16} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className={`font-bold text-sm ${isLast ? 'text-yellow-700' : 'text-slate-800'}`}>
                              {event.title}
                            </h4>
                            <span className="text-xs text-slate-500 whitespace-nowrap">{event.time}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{event.description}</p>
                          <p className="text-xs text-slate-400 mt-1">{event.date}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {isAdmin && (
            <div>
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <User size={18} className="text-yellow-600" />
                Dados do Solicitante
              </h3>
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User size={14} className="text-slate-400" />
                  <span className="text-slate-600">Nome:</span>
                  <span className="font-semibold text-slate-800">{request.citizenName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={14} className="text-slate-400" />
                  <span className="text-slate-600">E-mail:</span>
                  <span className="font-semibold text-slate-800">{request.citizenEmail}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={14} className="text-slate-400" />
                  <span className="text-slate-600">Telefone:</span>
                  <span className="font-semibold text-slate-800">{request.citizenPhone}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {!isAdmin && request.status !== 'done' && (
              <button className="flex-1 bg-slate-100 text-slate-700 font-medium py-3 rounded-lg hover:bg-slate-200 transition flex items-center justify-center gap-2">
                <MessageSquare size={18} />
                Enviar Mensagem
              </button>
            )}
            <button 
              onClick={onClose}
              className="flex-1 bg-yellow-500 text-slate-900 font-bold py-3 rounded-lg hover:bg-yellow-400 transition"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SGIApp;