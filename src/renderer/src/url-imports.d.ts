declare module '*?url' {
  const url: string
  export default url
}

declare module 'onnxruntime-web' {
  export * from 'onnxruntime-common'
}

declare module '*?inline' {
  const dataUrl: string
  export default dataUrl
}
