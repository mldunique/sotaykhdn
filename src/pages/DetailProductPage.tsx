import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './DetailGroupPage.css';
import './DetailProductPage.css';
import toast from 'react-hot-toast';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import Cropper from 'react-easy-crop';
import axios from 'axios';
import { API_ENDPOINTS, BASE_URL } from '../config/apiConfig';

// LƯU Ý: Đảm bảo đường dẫn import này khớp với cấu trúc thư mục của bạn
import { getUserMap, getFullName } from '../utils/userUtils'; 

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; className: string }> = {
  ACTIVE:           { label: 'Đang hoạt động',    className: 'status-active'   },
  DRAFT:            { label: 'Lưu nháp',           className: 'status-draft'    },
  NEEDS_REVISION:   { label: 'Yêu cầu chỉnh sửa', className: 'status-revision' },
  PENDING_APPROVAL: { label: 'Chờ phê duyệt',      className: 'status-pending'  },
  REJECTED:         { label: 'Từ chối',             className: 'status-rejected' },
  ARCHIVED:         { label: 'Lưu trữ',             className: 'status-archived' },
};

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Criterion {
  id: string;
  name: string;
  isRequired: boolean;
  isSelected: boolean;
  value: string;
}

interface PixelCrop {
  x: number; y: number; width: number; height: number;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const serializeCriteriaForDiff = (list: Criterion[]) =>
  JSON.stringify(list.map(c => ({ name: c.name, value: c.value, isSelected: c.isSelected })));

const isHtmlEmpty = (html: string) => {
  if (!html) return true;
  return html.replace(/<[^>]*>?/gm, '').trim().length === 0 && !html.includes('<img');
};

const formatDateTime = (dateString?: string) => {
  if (!dateString) return '---';
  return new Date(dateString).toLocaleDateString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

const checkIsRequired = (item: any) => {
  if (item.isRequired === true || item.isRequired === 'true') return true;
  if (item.required   === true || item.required   === 'true') return true;
  if (item.isRequire  === true || item.isRequire  === 'true') return true;
  if (item.batBuoc    === true || item.batBuoc    === 'true') return true;
  const t1 = String(item.tieuChi || item.name  || '');
  const t2 = String(item.noiDung || item.value || '');
  return t1.includes('(*)') || t2.includes('(*)');
};

const toDisplayUrl = (raw: string) => {
  if (!raw) return '';
  if (raw.startsWith('http')) {
    if (raw.includes('localhost:8082') || (BASE_URL && raw.includes(BASE_URL))) {
      return raw.replace(/^(https?:\/\/[^\/]+)/, '');
    }
    return raw;
  }
  const cleanPath = raw.includes('/files/') 
    ? raw.substring(raw.indexOf('/files/')) 
    : `/files/products/${raw}`;
  return cleanPath; 
};

// ─────────────────────────────────────────────
// Canvas crop → Blob
// ─────────────────────────────────────────────
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.onload  = () => resolve(img);
    img.onerror = reject;
  });

const getCroppedBlob = async (src: string, px: PixelCrop): Promise<Blob> => {
  const img    = await createImage(src);
  const canvas = document.createElement('canvas');
  canvas.width  = px.width;
  canvas.height = px.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, px.x, px.y, px.width, px.height, 0, 0, px.width, px.height);
  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92));
};

// ─────────────────────────────────────────────
// ImageModal
// ─────────────────────────────────────────────
interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (file: File, blobUrl: string) => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const fileInputRef            = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging]   = useState(false);
  const [step, setStep]               = useState<'drop' | 'crop'>('drop');
  const [dataUrl, setDataUrl]         = useState('');        
  const [fileName, setFileName]       = useState('');
  const [crop, setCrop]               = useState({ x: 0, y: 0 });
  const [zoom, setZoom]               = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelCrop | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep('drop');
      setDataUrl('');
      setFileName('');
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setIsDragging(false);
    }
  }, [isOpen]);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file ảnh (PNG, JPG, WEBP)');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setDataUrl(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setStep('crop');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onCropComplete = useCallback((_: any, px: PixelCrop) => {
    setCroppedAreaPixels(px);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const blob = await getCroppedBlob(dataUrl, croppedAreaPixels);
      const file = new File([blob], fileName || 'cropped.jpg', { type: 'image/jpeg' });
      onConfirm(file, URL.createObjectURL(blob));
    } catch (e) {
      console.error('Crop error:', e);
      toast.error('Cắt ảnh thất bại, vui lòng thử lại');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '600px', maxWidth: '95vw', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>
            {step === 'crop' ? 'Căn chỉnh & Cắt ảnh (16:9)' : 'Thêm hình ảnh'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {step === 'drop' && (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: `1.5px dashed ${isDragging ? '#10B981' : '#E5E7EB'}`, borderRadius: '8px', padding: '40px 20px', textAlign: 'center', backgroundColor: isDragging ? '#F0FDF4' : 'transparent', transition: 'all 0.2s ease', cursor: 'pointer' }}
            >
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <p style={{ margin: '12px 0 4px', fontSize: 14, color: '#6B7280' }}>Kéo và thả ảnh tại đây hoặc</p>
              <span style={{ color: '#10B981', fontWeight: 600, fontSize: '15px' }}>Chọn file</span>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#9CA3AF' }}>PNG, JPG, WEBP · Tối đa 10MB</p>
            </div>
          )}

          {step === 'crop' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ position: 'relative', width: '100%', height: '320px', backgroundColor: '#1a1a1a', borderRadius: '8px', overflow: 'hidden' }}>
                <Cropper
                  image={dataUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={16 / 9}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                  showGrid={true}
                  style={{
                    containerStyle: { backgroundColor: '#1a1a1a' },
                    cropAreaStyle:  { border: '2px solid rgba(255,255,255,0.88)', color: 'rgba(0,0,0,0.55)' },
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 0' }}>
                <span style={{ fontSize: '14px', color: '#4B5563', fontWeight: 500, minWidth: '70px' }}>Thu phóng:</span>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.05}
                  onChange={e => setZoom(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#AE1C3F', cursor: 'pointer' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setStep('drop');
                    setDataUrl('');
                    setFileName('');
                    setCrop({ x: 0, y: 0 });
                    setZoom(1);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '14px', fontWeight: 600, marginLeft: '8px', whiteSpace: 'nowrap' }}
                >
                  Chọn ảnh khác
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #E5E7EB' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            style={{ padding: '8px 24px', borderRadius: '6px', border: 'none', backgroundColor: '#E5E7EB', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={step === 'drop' || !dataUrl || isProcessing}
            style={{ padding: '8px 24px', borderRadius: '6px', border: 'none', backgroundColor: '#AE1C3F', color: 'white', fontWeight: 600, fontSize: '14px', cursor: (step === 'drop' || !dataUrl || isProcessing) ? 'not-allowed' : 'pointer', opacity: (step === 'drop' || !dataUrl || isProcessing) ? 0.5 : 1 }}
          >
            {isProcessing ? 'Đang xử lý...' : 'Cắt & Tải lên'}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────
// BatchApprovalModal (Thông báo xác nhận gửi phê duyệt theo lô đúng chuẩn UI)
// ─────────────────────────────────────────────
interface BatchApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitBatch: (requestId: string, status: string) => void;
  requestId: string;
  requestName: string;
}

const BatchApprovalModal: React.FC<BatchApprovalModalProps> = ({ isOpen, onClose, onSubmitBatch, requestId , requestName }) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onSubmitBatch(requestId, 'PENDING_APPROVAL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, backdropFilter: 'blur(2px)' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '440px', maxWidth: '95vw', padding: '32px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', boxSizing: 'border-box' }}>
        
        {/* Warning Icon */}
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FEFCE8', border: '8px solid #FEFDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', boxShadow: '0 0 0 4px #FEF9C3' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CA8A04" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <p style={{ margin: '0 0 24px 0', fontSize: '18px', fontWeight: 500, color: '#111827', textAlign: 'center', lineHeight: '1.5' }}>
          Bạn muốn gửi Phê duyệt <span style={{ color: '#AE1C3F', fontWeight: 600 }}>{requestName || 'Tên yêu cầu'}</span>
        </p>
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{ flex: 1, padding: '10px 20px', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: '#F3F4F6', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '15px', transition: 'background-color 0.2s' }}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            style={{ flex: 1, padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#AE1C3F', color: 'white', fontWeight: 600, fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s' }}
          >
            {loading ? 'Đang xử lý...' : 'Phê duyệt'}
          </button>
        </div>

      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// QuillEditor
// ─────────────────────────────────────────────
interface QuillEditorProps {
  value: string;
  onChange: (content: string) => void;
  placeholder?: string;
  hasError?: boolean;
  readOnly?: boolean;
}

const QuillEditor: React.FC<QuillEditorProps> = ({ value, onChange, placeholder, hasError, readOnly }) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorRef  = useRef<HTMLDivElement>(null);
  const quillRef   = useRef<Quill | null>(null);

  useEffect(() => {
    if (!editorRef.current || !toolbarRef.current || quillRef.current) return;
    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder: placeholder || 'Nhập nội dung chi tiết...',
      modules: { toolbar: readOnly ? false : toolbarRef.current },
      readOnly: readOnly,
    });
    quillRef.current = quill;
    if (value) quill.clipboard.dangerouslyPasteHTML(value);
    
    if (!readOnly) {
      quill.on('text-change', () => {
        const h = quill.root.innerHTML;
        onChange(h === '<p><br></p>' ? '' : h);
      });
    }
    return () => { quillRef.current = null; };
  }, [readOnly]);

  useEffect(() => {
    if (!quillRef.current) return;
    quillRef.current.enable(!readOnly);
    const cur = quillRef.current.root.innerHTML;
    if (value !== cur && !(value === '' && cur === '<p><br></p>'))
      quillRef.current.clipboard.dangerouslyPasteHTML(value || '');
  }, [value, readOnly]);

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', border: hasError ? '1px solid #EF4444' : '1px solid #D1D5DB', boxShadow: hasError ? '0 0 0 1px rgba(239,68,68,0.15)' : 'none', transition: 'all 0.2s ease' }}>
      {!readOnly && (
        <div ref={toolbarRef} className="ql-toolbar ql-snow" style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '8px 12px', backgroundColor: hasError ? '#FEF2F2' : '#F9FAFB' }}>
          <span className="ql-formats">
            <button className="ql-bold"/><button className="ql-italic"/>
            <button className="ql-underline"/><button className="ql-strike"/>
          </span>
          <span className="ql-formats">
            <button className="ql-list" value="ordered"/>
            <button className="ql-list" value="bullet"/>
          </span>
          <span className="ql-formats">
            <button className="ql-script" value="sub"/>
            <button className="ql-script" value="super"/>
          </span>
          <span className="ql-formats">
            <button className="ql-indent" value="-1"/>
            <button className="ql-indent" value="+1"/>
          </span>
          <span className="ql-formats"><select className="ql-color"/><select className="ql-background"/></span>
          <span className="ql-formats"><select className="ql-align"/></span>
          <span className="ql-formats"><button className="ql-clean"/></span>
        </div>
      )}
      <div ref={editorRef} style={{ minHeight: 120, fontSize: 15, border: 'none', backgroundColor: readOnly ? '#F9FAFB' : '#FFF' }}/>
    </div>
  );
};

// ─────────────────────────────────────────────
// CriteriaModal
// ─────────────────────────────────────────────
const CriteriaModal: React.FC<{
  isOpen: boolean; onClose: () => void;
  criteria: Criterion[]; onToggle: (id: string) => void;
}> = ({ isOpen, onClose, criteria, onToggle }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1050, backdropFilter: 'blur(2px)' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 12, width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>Thêm tiêu chí</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', maxHeight: 400, padding: '8px 0' }}>
          {criteria.filter(c => !c.isRequired).map(c => (
            <div key={c.id} onClick={() => onToggle(c.id)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', cursor: 'pointer', backgroundColor: c.isSelected ? '#FDF2F4' : 'transparent', transition: 'background-color 0.2s', borderBottom: '1px solid #F3F4F6' }}
              className="figma-option-row">
              <span style={{ fontSize: 15, fontWeight: c.isSelected ? 500 : 400, color: c.isSelected ? '#111827' : '#374151', userSelect: 'none' }}>{c.name}</span>
              {c.isSelected && (
                <svg width="16" height="16" viewBox="0 0 16 12" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M1.33334 6.00001L5.33334 10L14.6667 1.33334" stroke="#AE1C3F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#F9FAFB', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
          <button onClick={onClose}
            style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #D1D5DB', backgroundColor: 'white', color: '#374151', fontWeight: 500, cursor: 'pointer', fontSize: 14 }}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// DetailProductPage
// ─────────────────────────────────────────────
const DetailProductPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Khởi tạo userMap ngay khi vào component, chỉ chạy 1 lần
  const userMap = useMemo(() => getUserMap(), []);

  const groupRef     = useRef<HTMLDivElement>(null);
  const categoryRef  = useRef<HTMLDivElement>(null);
  const operationRef = useRef<HTMLDivElement>(null);
  const statusRef    = useRef<HTMLDivElement>(null);
  
  const isInitialLoadRef = useRef(true);

  const [isGroupOpen,       setIsGroupOpen]       = useState(false);
  const [isCategoryOpen,    setIsCategoryOpen]    = useState(false);
  const [isOperationOpen,   setIsOperationOpen]   = useState(false);
  const [isStatusOpen,      setIsStatusOpen]      = useState(false);
  const [showCriteriaModal, setShowCriteriaModal] = useState(false);
  const [showImageModal,    setShowImageModal]    = useState(false);
  
  // State quản lý Modal xác nhận gửi phê duyệt theo lô
  const [showBatchModal,    setShowBatchModal]    = useState(false);

  const [groupOptions,     setGroupOptions]     = useState<{ label: string; value: string }[]>([]);
  const [categoryOptions,  setCategoryOptions]  = useState<{ label: string; value: string }[]>([]);
  const [operationOptions, setOperationOptions] = useState<{ label: string; value: string }[]>([]);

  const [loading,           setLoading]           = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingOperations, setLoadingOperations] = useState(false);

  const [productData, setProductData] = useState<any>(null);
  const [isActive,    setIsActive]    = useState(true);
  const [formData,    setFormData]    = useState({ productGroupId: '', productCategoryId: '', businessId: '' });

  const [criteria,         setCriteria]         = useState<Criterion[]>([]);
  const [originalCriteria, setOriginalCriteria] = useState<Criterion[]>([]);

  const [previewImage, setPreviewImage] = useState('');   
  const [avatarFile,   setAvatarFile]   = useState<File | null>(null); 
  const [imageRemoved, setImageRemoved] = useState(false); 

  // --- KIỂM TRA ĐĂNG NHẬP & QUYỀN SỞ HỮU ---
  const getCurrentUsername = () => {
    const possibleKeys = ['currentUserUsername', 'username', 'userCode', 'userId', 'account', 'user', 'userInfo', 'currentUser'];
    for (const key of possibleKeys) {
      const val = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (typeof parsed === 'object' && parsed !== null) {
            const u = parsed.username || parsed.userName || parsed.code || parsed.sub || parsed.userCode || parsed.id;
            if (u) return String(u).trim().toLowerCase();
          }
        } catch {
          return String(val).trim().toLowerCase();
        }
      }
    }
    return '';
  };
  
  const handleApproveClick = () => {
    const isBatch = productData?.requestId || productData?.batchRequestId;
    
    if (isBatch) {
      setShowBatchModal(true);
    } else {
      // Gọi cập nhật trạng thái kèm nội dung nháp trước đó (cho sản phẩm lẻ)
      handleUpdateProduct('PENDING_APPROVAL');
    }
  };

  // CẬP NHẬT CHÍNH: Tách xử lý baseUsername để xác nhận cho phép chỉnh sửa
  let rawCurrentUsername = getCurrentUsername();
  const currentUsername = rawCurrentUsername ? rawCurrentUsername.split('_')[0].toLowerCase() : '';
  const isLoggedIn = Boolean(currentUsername);

  const creatorField = productData?.createdBy || productData?.created_by || productData?.creator || productData?.user || productData?.userId;
  let rawCreatorUsername = '';
  if (typeof creatorField === 'object' && creatorField !== null) {
    rawCreatorUsername = (creatorField.username || creatorField.userName || creatorField.name || creatorField.code || creatorField.id || '').trim().toLowerCase();
  } else if (creatorField !== undefined && creatorField !== null) {
    rawCreatorUsername = String(creatorField).trim().toLowerCase();
  }
  
  // Tách lấy base username từ API trả về (VD: "37ETN082_10500037" -> "37etn082")
  const creatorUsername = rawCreatorUsername ? rawCreatorUsername.split('_')[0] : '';

  const isOwner = Boolean(
    isLoggedIn && 
    currentUsername && 
    creatorUsername && 
    currentUsername === creatorUsername
  );
  

  const isReadOnly = !isLoggedIn || !isOwner;

  useEffect(() => {
    if (productData?.imageUrl) setPreviewImage(toDisplayUrl(productData.imageUrl));
  }, [productData?.imageUrl]);

  useEffect(() => {
    return () => { if (avatarFile && previewImage.startsWith('blob:')) URL.revokeObjectURL(previewImage); };
  }, [previewImage, avatarFile]);

  const handleImageConfirm = (file: File, blobUrl: string) => {
    if (isReadOnly) return;
    if (avatarFile && previewImage.startsWith('blob:')) URL.revokeObjectURL(previewImage);
    setAvatarFile(file);
    setPreviewImage(blobUrl);
    setImageRemoved(false);
    setShowImageModal(false);
  };

  const handleRemoveImage = () => {
    if (isReadOnly) return;
    if (avatarFile && previewImage.startsWith('blob:')) URL.revokeObjectURL(previewImage);
    setAvatarFile(null);
    setPreviewImage('');
    setImageRemoved(true);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const response = await axios.post(API_ENDPOINTS.FILES.UPLOAD, fd);
      return response.data.url; 
    } catch (error) {
      console.error("Lỗi upload ảnh:", error);
      throw new Error('Upload ảnh lên hệ thống thất bại');
    }
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (groupRef.current     && !groupRef.current.contains(e.target as Node))     setIsGroupOpen(false);
      if (categoryRef.current  && !categoryRef.current.contains(e.target as Node))  setIsCategoryOpen(false);
      if (operationRef.current && !operationRef.current.contains(e.target as Node)) setIsOperationOpen(false);
      if (statusRef.current    && !statusRef.current.contains(e.target as Node))    setIsStatusOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // 1. Fetch dữ liệu sản phẩm chi tiết ban đầu
  useEffect(() => {
    const init = async () => {
      if (!id) return;
      isInitialLoadRef.current = true;
      try {
        setLoading(true);
        const [pRes, gRes] = await Promise.all([
          fetch(API_ENDPOINTS.PRODUCT.DETAIL(id)),
          fetch(`${API_ENDPOINTS.PRODUCT_GROUPS.LIST}?status=ACTIVE&active=true`),
        ]);
        if (!pRes.ok) throw new Error('Không thể tải thông vị sản phẩm');
        const pData = await pRes.json();
        setProductData(pData);
        setIsActive(pData.active ?? true);
        setFormData({
          productGroupId:    pData.productGroupId    || '',
          productCategoryId: pData.productCategoryId || '',
          businessId:        pData.businessId        || '',
        });
        if (gRes.ok) {
          const gd = await gRes.json();
          setGroupOptions(gd.map((g: any) => ({ label: g.name, value: g.id })));
        }

        const rawDetails = pData.details || [];
        if (rawDetails.length > 0) {
          const mapped: Criterion[] = rawDetails.map((item: any, i: number) => ({
            id:         String(item.id || item.criteriaId || item.stt || i),
            name:       (item.tieuChi || item.name || '').replace(/\s*\(\*\)/g, ''),
            isRequired: checkIsRequired(item),
            isSelected: true,
            value:      item.noiDung || item.value || '',
          }));
          setOriginalCriteria(JSON.parse(JSON.stringify(mapped)));
          setCriteria(mapped);
        }
      } catch (e) {
        console.error(e);
        toast.error('Không tìm thấy sản phẩm hoặc cấu trúc dữ liệu không khớp');
      } finally { 
        setLoading(false); 
        setTimeout(() => {
          isInitialLoadRef.current = false;
        }, 100);
      }
    };
    init();
  }, [id]);
  useEffect(() => {
    if (!formData.productGroupId) { 
      setCategoryOptions([]); 
      setOperationOptions([]); 
      setCriteria([]);
      return; 
    }
    (async () => {
      try {
        setLoadingCategories(true);
        const r = await fetch(`${API_ENDPOINTS.PRODUCT_CATEGORY.LIST}?status=ACTIVE&types=${formData.productGroupId}&active=true`);
        if (r.ok) { 
          const d = await r.json(); 
          setCategoryOptions(d.map((c: any) => ({ label: c.name, value: c.id }))); 
        }
      } catch (e) { console.error(e); } finally { setLoadingCategories(false); }
    })();
    (async () => {
      try {
        setLoadingOperations(true);
        const ep = API_ENDPOINTS.PRODUCT_BUSINESS?.LIST || API_ENDPOINTS.PRODUCT_GROUPS.LIST.replace('product-groups', 'business');
        const r = await fetch(`${ep}?status=ACTIVE&types=${formData.productGroupId}&active=true`);
        if (r.ok) { 
          const d = await r.json(); 
          setOperationOptions(d.map((b: any) => ({ label: b.name, value: b.id }))); 
        }
      } catch (e) { console.error(e); } finally { setLoadingOperations(false); }
    })();
    (async () => {
      try {
        const url = `${API_ENDPOINTS.PRODUCT_CRITERIA.LIST}?types=${formData.productGroupId}&status=ACTIVE&active=true`;
        const r = await fetch(url);
        if (!r.ok) return;
        
        const resData = await r.json();
        const data = Array.isArray(resData) ? resData : (resData?.content || resData?.data || []);

        setCriteria(prevCriteria => {
          return data.map((item: any) => {
            const criterionId = String(item.id || item.criteriaId);
            const name = (item.tieuChi || item.name || '').replace(/\s*\(\*\)/g, '').trim();
            const isReq = checkIsRequired(item);
            const existing = prevCriteria.find(o => 
              String(o.id) === criterionId || 
              String((o as any).criteriaId) === criterionId ||
              o.name.trim().toLowerCase() === name.toLowerCase()
            );
            let isSelected = false;
            if (isReq) {
              isSelected = true; 
            } else if (existing) {
              isSelected = existing.isSelected !== undefined ? existing.isSelected : true;
            } else {
              isSelected = false; 
            }

            return {
              id: criterionId,
              name,
              isRequired: isReq,
              isSelected: isSelected,
              value: existing ? existing.value : ''
            };
          }).sort((a: Criterion, b: Criterion) => Number(b.isRequired) - Number(a.isRequired));
        });
      } catch (e) { 
        console.error('Lỗi tải danh sách tiêu chí:', e); 
      }
    })();
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
    }

  }, [formData.productGroupId]);

  const handleCriterionValueChange = (id: string, v: string) => {
    if (isReadOnly) return;
    setCriteria(prev => prev.map(c => c.id === id ? { ...c, value: v } : c));
  };

  const toggleCriterionSelection = (id: string) => {
    if (isReadOnly) return;
    setCriteria(prev => prev.map(c => c.id !== id ? c : (c.isRequired ? c : { ...c, isSelected: !c.isSelected })));
  };

  const isFormDirty     = formData.productGroupId !== (productData?.productGroupId || '') || formData.productCategoryId !== (productData?.productCategoryId || '') || formData.businessId !== (productData?.businessId || '');
  const isCriteriaDirty = serializeCriteriaForDiff(criteria) !== serializeCriteriaForDiff(originalCriteria);
  const isDirty         = isFormDirty || isCriteriaDirty || avatarFile !== null || imageRemoved || isActive !== (productData?.active ?? true);

  // THÊM PENDING_APPROVAL VÀO ĐÂY
  const handleUpdateProduct = async (status: 'ARCHIVED' | 'DRAFT' | 'ACTIVE' | 'PENDING_APPROVAL') => {
    if (isReadOnly || !id) return;
    if (status !== 'ARCHIVED' && status !== 'ACTIVE') {
      if (!formData.productGroupId) { toast.error('Vui lòng chọn Nhóm sản phẩm', { position: 'top-center' }); return; }
    }
    try {
      setLoading(true);
      let finalImageUrl: string | null;
      if      (imageRemoved) { finalImageUrl = null; }
      else if (avatarFile)   { try { finalImageUrl = await uploadImage(avatarFile); } catch (e: any) { toast.error(e.message || 'Lỗi upload ảnh', { position: 'top-center' }); setLoading(false); return; } }
      else                   { finalImageUrl = productData.imageUrl || null; }

      const payload = {
        name:              productData.name,
        productGroupId:    formData.productGroupId    || productData.productGroupId,
        productCategoryId: formData.productCategoryId || null,
        businessId:        formData.businessId        || null,
        active:            isActive,
        imageUrl:          finalImageUrl,
        status,
        criteria: criteria.filter(c => c.isSelected).map(c => ({ criteriaId: c.id, value: c.value.trim() })),
      };
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await fetch(API_ENDPOINTS.PRODUCT.UPDATE(id), { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }, 
        body: JSON.stringify(payload) 
      });
      if (res.ok) {
        // CẬP NHẬT THÊM CÂU THÔNG BÁO PENDING_APPROVAL
        const msgs: Record<string, string> = {
          DRAFT: 'Lưu nháp sản phẩm thành công', 
          ARCHIVED: 'Lưu trữ sản phẩm thành công',
          ACTIVE: 'Kích hoạt sản phẩm hoạt động trở lại thành công',
          PENDING_APPROVAL: 'Gửi phê duyệt sản phẩm thành công',
        };
        renderCustomToast(msgs[status] || 'Cập nhật sản phẩm thành công');
        setTimeout(() => navigate('/products/processing'), 2000);
      } else {
        const err = await res.json();
        toast.error(err.message || 'Có lỗi xảy ra khi cập nhật sản phẩm', { position: 'top-center' });
        setLoading(false);
      }
    } catch (e) { console.error(e); toast.error('Lỗi kết nối máy chủ', { position: 'top-center' }); setLoading(false); }
  };

  // CẬP NHẬT LẠI HÀM NÀY: CHỈ XỬ LÝ LÔ
  const handleBatchStatusSubmit = async (requestId: string, status: string) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token') || sessionStorage.getItem('token');
      
      // Bỏ '|| id' đi vì hàm này không dùng để submit lẻ nữa
      const targetRequestId = requestId || productData?.requestId || productData?.batchRequestId;
      
      if (!targetRequestId) {
          toast.error('Không tìm thấy thông tin lô!', { position: 'top-center' });
          return;
      }

      const targetRequestName = productData?.requestName || 'Tên yêu cầu'; 

      const response = await axios.post(
        `${BASE_URL}/product-requests/status/${targetRequestId}`,
        { status },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        }
      );

      if (response.status === 200 || response.status === 204) {
        toast.success(`Gửi phê duyệt lô ${targetRequestName} thành công!`, { position: 'top-center' });
        setShowBatchModal(false);
        setTimeout(() => navigate('/products/processing'), 1500);
      }
    } catch (error: any) {
      console.error('Lỗi gửi phê duyệt theo lô:', error);
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra khi gửi phê duyệt theo lô', { position: 'top-center' });
    }
  };

  const handleDeleteProduct = () => {
    if (isReadOnly || !id) return;
    toast.custom(t => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} confirm-toast-card`}>
        <div className="confirm-toast-body">
          <div className="confirm-toast-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="22" viewBox="0 0 17 19" fill="none">
              <path d="M0.835938 4.16829H2.5026M2.5026 4.16829H15.8359M2.5026 4.16829V15.835C2.5026 16.277 2.6782 16.7009 2.99076 17.0135C3.30332 17.326 3.72724 17.5016 4.16927 17.5016H12.5026C12.9446 17.5016 13.3686 17.326 13.6811 17.0135C13.9937 16.7009 14.1693 16.277 14.1693 15.835V4.16829H2.5026ZM5.0026 4.16829V2.50163C5.0026 2.0596 5.1782 1.63568 5.49076 1.32312C5.80332 1.01056 6.22724 0.834961 6.66927 0.834961H10.0026C10.4446 0.834961 10.8686 1.01056 11.1811 1.32312C11.4937 1.63568 11.6693 2.0596 11.6693 2.50163V4.16829M6.66927 8.33496V13.335M10.0026 8.33496V13.335" stroke="#AE1C3F" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="confirm-toast-content">
            <p className="confirm-toast-title">Xác nhận xóa sản phẩm</p>
            <p className="confirm-toast-desc">Bạn có chắc chắn muốn xóa sản phẩm này không? Hành động này không thể hoàn tác.</p>
          </div>
        </div>
        <div className="confirm-toast-actions">
          <button className="confirm-btn-delete" onClick={async () => { toast.dismiss(t.id); await executeDelete(); }}>Xóa</button>
          <button className="confirm-btn-cancel" onClick={() => toast.dismiss(t.id)}>Hủy</button>
        </div>
      </div>
    ), { position: 'top-center', duration: Infinity });
  };

  const executeDelete = async () => {
    if (isReadOnly || !id) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await fetch(API_ENDPOINTS.PRODUCT.DELETE(id), { 
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (res.ok) { renderCustomToast('Xóa sản phẩm thành công'); setTimeout(() => navigate('/products/processing'), 2000); }
      else { const e = await res.json(); toast.error(e.message || 'Có lỗi xảy ra khi xóa', { position: 'top-center' }); setLoading(false); }
    } catch (e) { console.error(e); toast.error('Lỗi kết nối máy chủ', { position: 'top-center' }); setLoading(false); }
  };

  const renderCustomToast = (message: string) => {
    toast.custom(t => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} toast-pill-container`}>
        <div className="toast-pill-content">
          <div className="toast-pill-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <span className="toast-pill-text">{message}</span>
        </div>
        <button onClick={() => toast.dismiss(t.id)} className="toast-pill-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    ), { position: 'top-center' });
  };

  const getCleanProductName = (html: string) =>
    !html ? 'Chi tiết sản phẩm' :
    html.replace(/<\/?[^>]+(>|$)/g, '').replace(/^-\s*/, '').replace(/\(\*\)/g, '').trim() || 'Chi tiết sản phẩm';

  if (loading)      return <div className="loading">Đang tải dữ liệu sản phẩm...</div>;
  if (!productData) return <div className="error">Không tìm thấy dữ liệu sản phẩm phù hợp.</div>;

  const currentStatus        = STATUS_MAP[productData.status] || { label: productData.status, className: '' };
  const productNameBreadcrumb = getCleanProductName(productData.name);
  const activeRequestId = productData?.requestId || productData?.batchRequestId || 'Lô ABC';
  const requestName = productData?.requestName || 'Tên yêu cầu';

  return (
    <div className="pageWrapper">
      <style>{`.ql-editor{word-break:break-word!important;overflow-wrap:break-word!important;white-space:pre-wrap!important;}`}</style>

      <div className="mainContainer">
        {isReadOnly && (
          <div className="permissionBanner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span className="permissionBannerText">
              Bạn đang xem ở chế độ chỉ đọc (Read-only) vì bạn không phải là người tạo sản phẩm này.
            </span>
          </div>
        )}

        {/* ══ Header ══ */}
        <div className="header">
          <div className="headerLeft">
            <button className="btnBack" onClick={() => navigate(-1)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M12.6667 6.83333H1M6.83333 1L1 6.83333L6.83333 12.6667" stroke="#3C393F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="breadcrumbText">Danh sách sản phẩm</span>
            </button>
            <div className="breadcrumb">
              <div className="separatorWrapper">
                <svg width="5" height="9" viewBox="0 0 5 9" fill="none">
                  <path d="M0.5 8.5L4.5 4.5L0.5 0.5" stroke="#171717" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="breadcrumbActive breadcrumb-truncate" title={productNameBreadcrumb}>{productNameBreadcrumb}</span>
              <div className={`statusBadge ${currentStatus.className}`}>
                <span className="dot"/><span className="statusText">{currentStatus.label}</span>
              </div>
            </div>
          </div>

          <div className="headerRight" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isReadOnly ? (
              <span style={{}}>
              </span>
            ) : (
              <>
                {productData.status === 'DRAFT' && (<>
                  <button className="btnDraft" onClick={handleDeleteProduct} style={{ display: 'flex', padding: '8px 14px', alignItems: 'center', gap: 6, borderRadius: 8, background: '#E3DFE6', border: 'none', cursor: 'pointer', color: '#AE1C3F', fontSize: 14, fontWeight: 600 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="17" viewBox="0 0 17 19" fill="none">
                      <path d="M0.835938 4.16829H2.5026M2.5026 4.16829H15.8359M2.5026 4.16829V15.835C2.5026 16.277 2.6782 16.7009 2.99076 17.0135C3.30332 17.326 3.72724 17.5016 4.16927 17.5016H12.5026C12.9446 17.5016 13.3686 17.326 13.6811 17.0135C13.9937 16.7009 14.1693 16.277 14.1693 15.835V4.16829H2.5026ZM5.0026 4.16829V2.50163C5.0026 2.0596 5.1782 1.63568 5.49076 1.32312C5.80332 1.01056 6.22724 0.834961 6.66927 0.834961H10.0026C10.4446 0.834961 10.8686 1.01056 11.1811 1.32312C11.4937 1.63568 11.6693 2.0596 11.6693 2.50163V4.16829M6.66927 8.33496V13.335M10.0026 8.33496V13.335" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Xóa
                  </button>
                  <button className={`btnDraft ${isDirty ? 'active' : 'disabled'}`} disabled={!isDirty} onClick={() => handleUpdateProduct('DRAFT')}>Lưu nháp</button>
                  <button className="btnSubmit active" onClick={handleApproveClick}>Gửi phê duyệt</button>
                </>)}
                {productData.status === 'ACTIVE' && (<>
                  <button className={`btnDraft ${isDirty ? 'active' : 'disabled'}`} disabled={!isDirty} onClick={() => handleUpdateProduct('DRAFT')}>Lưu nháp</button>
                  <button className="btnDraft" onClick={() => handleUpdateProduct('ARCHIVED')}>Lưu trữ</button>
                  <button className="btnSubmit active" onClick={handleApproveClick}>Gửi phê duyệt</button>
                </>)}
                {productData.status === 'NEEDS_REVISION' && (<>
                  <button className={`btnDraft ${isDirty ? 'active' : 'disabled'}`} disabled={!isDirty} onClick={() => handleUpdateProduct('DRAFT')}>Lưu nháp</button>
                  <button className="btnSubmit active" onClick={handleApproveClick}>Gửi phê duyệt</button>
                </>)}
                {productData.status === 'ARCHIVED' && (
                  <button className="btnRestore active" onClick={() => handleUpdateProduct('ACTIVE')}>Hoạt động trở lại</button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ══ Content Grid ══ */}
        <div className="contentGrid">

          {/* ── LEFT ── */}
          <div className="leftCol">
            <div className="formCard">

              {/* Nhóm sản phẩm */}
              <div className="formGroup" style={{ marginBottom: 16 }}>
                <label className="label" style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Nhóm sản phẩm (*)</label>
                <div className="custom-select-container" ref={groupRef}>
                  <div 
                    className={`select-custom ${isGroupOpen ? 'open' : ''}`} 
                    onClick={() => !isReadOnly && setIsGroupOpen(v => !v)}
                    style={{ opacity: isReadOnly ? 0.8 : 1, cursor: isReadOnly ? 'default' : 'pointer', backgroundColor: isReadOnly ? '#F9FAFB' : '#FFF' }}
                  >
                    <span>{groupOptions.find(o => o.value === formData.productGroupId)?.label || 'Chọn nhóm'}</span>
                  </div>
                  {!isReadOnly && isGroupOpen && (
                    <div className="custom-options-list">
                      {groupOptions.map(o => (
                        <div key={o.value} className={`custom-option ${formData.productGroupId === o.value ? 'selected' : ''}`}
                          onClick={() => { setFormData({ productGroupId: o.value, productCategoryId: '', businessId: '' }); setIsGroupOpen(false); }}>
                          {o.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 20 }}>
                <div className="formGroup" style={{ flex: 1 }}>
                  <label className="label" style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Danh mục sản phẩm</label>
                  <div className="custom-select-container" ref={categoryRef}>
                    <div 
                      className={`select-custom ${isCategoryOpen ? 'open' : ''}`} 
                      onClick={() => !isReadOnly && setIsCategoryOpen(v => !v)}
                      style={{ opacity: isReadOnly ? 0.8 : 1, cursor: isReadOnly ? 'default' : 'pointer', backgroundColor: isReadOnly ? '#F9FAFB' : '#FFF' }}
                    >
                      <span>{loadingCategories ? 'Đang tải...' : (categoryOptions.find(o => o.value === formData.productCategoryId)?.label || 'Chọn danh mục')}</span>
                    </div>
                    {!isReadOnly && isCategoryOpen && (
                      <div className="custom-options-list">
                        <div className="custom-option" onClick={() => { setFormData({ ...formData, productCategoryId: '', businessId: '' }); setIsCategoryOpen(false); }}><i>-- Bỏ chọn --</i></div>
                        {categoryOptions.map(o => (
                          <div key={o.value} className={`custom-option ${formData.productCategoryId === o.value ? 'selected' : ''}`}
                            onClick={() => { setFormData({ ...formData, productCategoryId: o.value, businessId: '' }); setIsCategoryOpen(false); }}>{o.label}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="formGroup" style={{ flex: 1 }}>
                  <label className="label" style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Nghiệp vụ</label>
                  <div className="custom-select-container" ref={operationRef}>
                    <div 
                      className={`select-custom ${isOperationOpen ? 'open' : ''}`} 
                      onClick={() => !isReadOnly && setIsOperationOpen(v => !v)}
                      style={{ opacity: isReadOnly ? 0.8 : 1, cursor: isReadOnly ? 'default' : 'pointer', backgroundColor: isReadOnly ? '#F9FAFB' : '#FFF' }}
                    >
                      <span>{loadingOperations ? 'Đang tải...' : (operationOptions.find(o => o.value === formData.businessId)?.label || 'Chọn nghiệp vụ')}</span>
                    </div>
                    {!isReadOnly && isOperationOpen && (
                      <div className="custom-options-list">
                        <div className="custom-option" onClick={() => { setFormData({ ...formData, businessId: '' }); setIsOperationOpen(false); }}><i>-- Bỏ chọn --</i></div>
                        {operationOptions.map(o => (
                          <div key={o.value} className={`custom-option ${formData.businessId === o.value ? 'selected' : ''}`}
                            onClick={() => { setFormData({ ...formData, businessId: o.value }); setIsOperationOpen(false); }}>{o.label}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {criteria.filter(c => c.isSelected).map(criterion => {
                const hasErr = !isReadOnly && criterion.isRequired && isHtmlEmpty(criterion.value);
                return (
                  <div key={criterion.id} className="formGroup" style={{ marginTop: 24, marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      {!isReadOnly && !criterion.isRequired && (
                        <button type="button" onClick={() => toggleCriterionSelection(criterion.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', color: '#9CA3AF', transition: 'color 0.2s' }}
                          onMouseOver={e => e.currentTarget.style.color = '#EF4444'}
                          onMouseOut={e => e.currentTarget.style.color = '#9CA3AF'}
                          title="Bỏ tiêu chí này">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                          </svg>
                        </button>
                      )}
                      <label className="label" style={{ fontWeight: 600, margin: 0 }}>
                        {criterion.name} {criterion.isRequired && <span style={{ color: '#EF4444' }}>(*)</span>}
                      </label>
                    </div>
                    <QuillEditor
                      value={criterion.value}
                      placeholder={criterion.isRequired ? 'Tiêu chí này bắt buộc phải nhập...' : 'Nhập nội dung chi tiết...'}
                      hasError={hasErr}
                      readOnly={isReadOnly}
                      onChange={v => handleCriterionValueChange(criterion.id, v)}
                    />
                    {hasErr && <span style={{ color: '#EF4444', fontSize: 13, marginTop: 6, display: 'block', fontWeight: 500 }}>⚠️ Trường bắt buộc, vui lòng nhập nội dung.</span>}
                  </div>
                );
              })}

              {!isReadOnly && formData.productGroupId && (
                <div style={{ textAlign: 'left', marginTop: 16 }}>
                  <button onClick={() => setShowCriteriaModal(true)} style={{ color: '#10B981', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    + Thêm tiêu chí
                  </button>
                </div>
              )}
            </div>

            <div className="formGroup" style={{ marginBottom: 20, marginTop: 16 }}>
              <label className="label" style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Ảnh mô tả</label>

              {previewImage ? (
                <div className="product-image-wrapper" style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
                  <img
                    src={previewImage}
                    alt="Product"
                    className="product-image"
                    style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 12, border: '1px solid #E5E7EB', display: 'block' }}
                  />
                  {!isReadOnly && (
                    <div className="image-overlay" style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 8 }}>
                      <button type="button" className="overlay-btn" onClick={() => setShowImageModal(true)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button type="button" className="overlay-btn" onClick={handleRemoveImage}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                !isReadOnly && (
                  <button type="button" onClick={() => setShowImageModal(true)}
                    className="upload-placeholder"
                    style={{ width: '100%', maxWidth: 420, aspectRatio: '16 / 9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1.5px dashed #E5E7EB', borderRadius: 12, background: 'transparent', cursor: 'pointer', color: '#6B7280', transition: 'all 0.2s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = '#10B981'; e.currentTarget.style.background = '#F0FDF4'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </div>
                    <span style={{ marginTop: 10, fontSize: 14, color: '#6B7280' }}>Kéo và thả ảnh tại đây hoặc</span>
                    <span style={{ color: '#10B981', fontWeight: 600, fontSize: 14 }}>Chọn file</span>
                    <span style={{ marginTop: 4, fontSize: 12, color: '#9CA3AF' }}>PNG, JPG, WEBP · Tỉ lệ 16:9</span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* ── RIGHT (Sticky Scrollable Sidebar) ── */}
          <div className="rightCol" style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '123px', height: 'fit-content' }}>
            <div className="formCard" style={{ borderRadius: 12, background: 'var(--Mauve-3, #F2EFF3)', display: 'flex', width: 340, padding: 24, flexDirection: 'column', alignItems: 'flex-start', gap: 10, border: '1px solid #E5E7EB', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#1A191B', fontSize: 16, fontWeight: 500, lineHeight: '24px' }}>Trạng thái hiển thị</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ cursor: 'help' }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </div>
              <div className="custom-select-container" ref={statusRef} style={{ width: '100%', position: 'relative' }}>
                <div 
                  className={`select-custom ${isStatusOpen ? 'open' : ''}`} 
                  onClick={() => !isReadOnly && setIsStatusOpen(v => !v)}
                  style={{ display: 'flex', padding: '8px 12px', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 8, border: '1px solid #D5D7DA', background: isReadOnly ? '#F9FAFB' : '#FFF', boxShadow: '0 1px 2px rgba(10,13,18,0.05)', cursor: isReadOnly ? 'default' : 'pointer', width: '100%', boxSizing: 'border-box' }}
                >
                  <span style={{ color: '#1A191B', fontWeight: 500 }}>{isActive === false ? 'Ẩn' : 'Hiển thị'}</span>
                  {!isReadOnly && (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isStatusOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M5 7.5L10 12.5L15 7.5"/>
                    </svg>
                  )}
                </div>
                {!isReadOnly && isStatusOpen && (
                  <div className="custom-options-list" style={{ zIndex: 50 }}>
                    <div className={`custom-option ${isActive === false ? 'selected' : ''}`} onClick={() => { setIsActive(false); setIsStatusOpen(false); }}>Ẩn</div>
                    <div className={`custom-option ${isActive === true  ? 'selected' : ''}`} onClick={() => { setIsActive(true);  setIsStatusOpen(false); }}>Hiển thị</div>
                  </div>
                )}
              </div>
            </div>

            <div className="commentCard emptyComment">
              <div className="commentHeader">
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M18.071 18.0698C15.0159 21.1264 10.4896 21.7867 6.78631 20.074C6.23961 19.8539 2.70113 20.8339 1.93334 20.067C1.16555 19.2991 2.14639 15.7601 1.92631 15.2134C0.212846 11.5106 0.874111 6.9826 3.9302 3.9271C7.83147 0.0243001 14.1698 0.0243001 18.071 3.9271C21.9803 7.83593 21.9723 14.1681 18.071 18.0698Z" stroke="#AE1C3F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="commentTitle">Bình luận phản hồi</span>
              </div>
              <div className="commentList">
                {productData?.comments?.length > 0 ? (
                  productData.comments.map((c: any, i: number) => (
                    <React.Fragment key={c.id || i}>
                      <div className="commentItem">
                        <div className="userInfo">
                          <img src={c.avatarUrl || 'https://images.squarespace-cdn.com/content/v1/61da6bc18e4e00423cffe684/1765779011140-U85TJYNQM9M24A5RQOZW/Leo+nui.png'} className="avatar" alt="avatar"/>
                          <div style={{ flex: 1 }}>
                            <div className="userHeader">
                              {/* CẬP NHẬT CHÍNH: Sử dụng getFullName để hiển thị tên đẹp hơn ở phần comment */}
                              <span className="userName">{getFullName(c.createdBy, userMap) || 'Người kiểm duyệt'}</span>
                              <span className="commentDate">{formatDateTime(c.createdAt)}</span>
                            </div>
                            <p className="commentText">{c.comment}</p>
                          </div>
                        </div>
                      </div>
                      {i < productData.comments.length - 1 && <hr className="commentDivider"/>}
                    </React.Fragment>
                  ))
                ) : (
                  <div className="no-comments">Chưa có bình luận hay phản hồi nào cho sản phẩm này.</div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      <CriteriaModal
        isOpen={showCriteriaModal}
        onClose={() => setShowCriteriaModal(false)}
        criteria={criteria}
        onToggle={toggleCriterionSelection}
      />

      <ImageModal
        isOpen={showImageModal}
        onClose={() => setShowImageModal(false)}
        onConfirm={handleImageConfirm}
      />

      {/* Modal xác nhận gửi phê duyệt theo lô đúng chuẩn UI */}
      <BatchApprovalModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        onSubmitBatch={handleBatchStatusSubmit}
        requestId={activeRequestId}
        requestName={requestName}
      />

    </div>
  );
};

export default DetailProductPage;