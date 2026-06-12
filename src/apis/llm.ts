import instance, { decodeResponse, ApiResponse } from '@/src/utils/request'
import { ApiTypes } from '@/src/types'
import { APP_CONSTANTS as config } from '@/src/config/constants';

export async function suggest(request: ApiTypes.llm.SuggestRequest): Promise<ApiResponse<ApiTypes.llm.SuggestResponse>> {
    const reqData = ApiTypes.llm.SuggestRequest.encode(request).finish()
    const res = await instance<ApiResponse<ApiTypes.llm.SuggestResponse>>({
        method: 'POST',
        url: `${config.messageServer}/ai/suggest`,
        data: reqData,
    })
    return decodeResponse(res.data, ApiTypes.llm.SuggestResponse.decode)
}