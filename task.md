#### 1
<!-- GroupMemberCard中的头像要替换为Avatar组件 -->

token刷新问题(
    要是中间客户端ws断了，就会触发token清除逻辑，重
    连后带上token连接发现token不存在导致，触发强制下线
)  <- 待测试

优化图片查看器启动逻辑(改为先打开窗口再加载图片)

setting界面优化，白天黑夜功能实现

虚拟列表

VideoBubble要优化(x-oss-process=video/snapshot,t_0,f_jpg)

缓存里面去掉了?后面的所有参数，所以fileService中获取图片地址和获取图片缩略图地址会进行同名缓存，解决

看一下sqlite里面message存储的的url字段是不是签名过的
