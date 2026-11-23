{{- /* Required in this cluster: every pod runs with low priority and without root rights */ -}}
{{- define "app.pod" -}}
priorityClassName: low-priority
automountServiceAccountToken: false
# No *_PORT/*_HOST variables per service (e.g. REDIS_PORT=tcp://…) in the app's environment
enableServiceLinks: false
securityContext:
  runAsNonRoot: true
  seccompProfile:
    type: RuntimeDefault
{{- end }}

{{- define "app.container" -}}
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
{{- end }}

{{- define "app.frontendUrl" -}}
https://{{ required "hosts.frontend is required" .Values.hosts.frontend }}
{{- end }}

{{- define "app.apiUrl" -}}
https://{{ required "hosts.api is required" .Values.hosts.api }}
{{- end }}

{{- define "app.image" -}}
{{- if eq .Values.images.tag "pending" }}
{{- fail "images.tag is still \"pending\" – the workflow has not built an image yet" }}
{{- end }}
{{- .Values.images.backend }}:{{ .Values.images.tag }}
{{- end }}

{{- /* Environment of every process from the backend image (API, worker, jobs) */ -}}
{{- define "app.backendEnv" -}}
{{- /* Missing S3, mail or Clerk settings don't block the rollout: the app switches that part
  off and names it at start (warning "Integration not configured"). */ -}}
- name: NODE_ENV
  value: production
- name: LOG_PRETTY
  value: "false"
- name: HOST
  value: "0.0.0.0"
- name: PORT
  value: {{ .Values.backend.port | quote }}
- name: BACKEND_PUBLIC_BASE_URL
  value: {{ include "app.apiUrl" . | quote }}
- name: FRONTEND_ORIGIN
  value: {{ include "app.frontendUrl" . | quote }}
- name: CORS_ORIGIN
  value: {{ include "app.frontendUrl" . | quote }}
- name: CLERK_AUTHORIZED_PARTIES
  value: {{ include "app.frontendUrl" . | quote }}
- name: STORAGE_S3_BOOTSTRAP_CORS_ORIGINS
  value: {{ include "app.frontendUrl" . | quote }}
- name: SENTRY_RELEASE
  value: {{ .Values.images.tag | quote }}
# Created by the database operator
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: db-app
      key: uri
- name: REDIS_PASSWORD
  valueFrom:
    secretKeyRef:
      name: app-secrets
      key: REDIS_PASSWORD
- name: REDIS_URL
  value: "redis://:$(REDIS_PASSWORD)@redis:6379/0"
{{- range $key, $value := .Values.backend.env }}
{{- if ne (toString $value) "" }}
- name: {{ $key }}
  value: {{ $value | quote }}
{{- end }}
{{- end }}
{{- end }}

{{- define "app.secretsAnnotation" -}}
annotations:
  checksum/secrets: {{ .Values.secretsChecksum | quote }}
{{- end }}

{{- /* Writable /tmp (image variants, temp files) on a read-only root file system */ -}}
{{- define "app.tmpMount" -}}
volumeMounts:
  - { name: tmp, mountPath: /tmp }
{{- end }}
{{- define "app.tmpVolume" -}}
volumes:
  - name: tmp
    emptyDir: {}
{{- end }}
