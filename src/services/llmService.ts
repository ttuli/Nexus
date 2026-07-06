import { ApiTypes } from "@shared/types"
import { suggest } from "@/src/apis/llm"

class LlmService {
    async suggest(request: ApiTypes.llm.SuggestRequest): Promise<ApiTypes.llm.SuggestResponse> {
        let res = await suggest(request)
        return res.data
    }
}

export default new LlmService()