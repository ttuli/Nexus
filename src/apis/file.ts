import instance from '@/utils/request'
const fileServer = import.meta.env.VITE_FILE_SERVER

export async function getUploadSignature() {
  return await instance.get(fileServer+'/fileupload/getPostSignature')
}