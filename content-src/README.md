# Content Source

이 폴더가 문항/콘텐츠의 편집 원본입니다.

- `meta.json`: concepts, errors, sources, learningPaths, annotationSpecs, questionFamilies, bankManifest
- `questions/*.json`: conceptId별 문항
- `question-order.json`: 런타임 문항 순서
- `catalog.json`: 개념별 파일/문항수 색인

수정 후 루트에서 `npm.cmd run check`를 실행하십시오.
`prototype/app-data.js`는 빌드 산출물이므로 직접 수정하지 않습니다.
