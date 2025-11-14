import instance from '@/utils/request'
import { NewApplyRequestF,HandleApplyRequestF,CreateGroupReq,GetGroupReq,JoinGroupReq,HandleApplyRequestG,SessionMsgReq } from '@/models/social'
const socialServer = import.meta.env.VITE_SOCIAL_SERVER

export async function getContactList() {
  return await instance.get(socialServer+'/social/pullFriendship')
}

export async function newFriendApply(req: NewApplyRequestF) {
  return await instance.post(socialServer+'/social/friend/newApplication', req)
}

export async function handleFriendApply(req:HandleApplyRequestF) {
  return await instance.put(socialServer+'/social/friend/handleApplication', req)
}

export async function handleGroupApply(req:HandleApplyRequestG) {
  return await instance.put(socialServer+'/social/group/handleGroup', req)
}

export async function getApply() {
  return await instance.get(socialServer+'/social/getApplication')
}

export async function createGroup(data:CreateGroupReq) {
  return await instance.post(socialServer+'/social/group/createGroup', data)
}

export async function getGroupList(data : GetGroupReq) {
  return await instance.get(socialServer+'/social/group/getGroup',
    {
      params: data
    }
  )
}

export async function joinGroup(data:JoinGroupReq) {
  return await instance.post(socialServer+'/social/group/joinGroup', data)
}

export async function getSessionMsg(params:SessionMsgReq) {
  return await instance.get(socialServer+'/social/getHistoryMessage',
    {
      params:params
    }
  )
}