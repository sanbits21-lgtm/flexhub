import { useRef, useState } from 'react';
import { profileAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { MIN_PHOTO_PIXELS, squareJpegBase64 } from '../utils/photo';
import Modal from './Modal';
import StaffAvatar from './StaffAvatar';

const errorText = (err) => err?.response?.data?.message || err?.message || 'Photo not saved. Try a different picture.';

// Your own picture, for trainers, branch managers and gym owners.
export default function ProfilePhotoModal({ open, onClose }) {
  const { user, updateUser } = useAuth();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  const choose = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await profileAPI.uploadPhoto(await squareJpegBase64(file));
      updateUser({ hasPhoto: true });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await profileAPI.removePhoto();
      updateUser({ hasPhoto: false });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const btn = 'rounded border px-3 py-1.5 text-sm dark:border-gray-600 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60';
  return (
    <Modal open={open} onClose={onClose} title="Profile photo">
      <div className="flex flex-col items-center gap-3 text-center">
        <StaffAvatar userId={user?._id} hasPhoto={user?.hasPhoto} name={user?.name} size={112} version={version} />
        <p className="text-sm text-gray-600 dark:text-gray-300">{user?.name}</p>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} className="sr-only" aria-label="Choose a profile photo" />
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={btn}>{busy ? 'Saving…' : user?.hasPhoto ? 'Change photo' : 'Add photo'}</button>
          {user?.hasPhoto && <button type="button" disabled={busy} onClick={remove} className={btn}>Remove</button>}
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <p className="text-xs text-gray-500 dark:text-gray-400">JPEG, PNG or WebP, at least {MIN_PHOTO_PIXELS}x{MIN_PHOTO_PIXELS} pixels. It is cropped to a square.</p>
      </div>
    </Modal>
  );
}
