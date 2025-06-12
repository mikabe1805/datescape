import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export async function uploadMediaFiles(uid, mediaFiles) {
  const urls = [];

  for (let i = 0; i < mediaFiles.length; i++) {
    const file = mediaFiles[i];
    if (!file) continue;

    const fileRef = ref(storage, `userMedia/${uid}/media_${i}_${file.name}`);
    await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(fileRef);
    urls.push(downloadURL);
  }

  return urls;
}
