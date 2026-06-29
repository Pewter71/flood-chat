{{/*
Полное имя релиза.
*/}}
{{- define "chat-app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Стандартные лейблы.
*/}}
{{- define "chat-app.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{ include "chat-app.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: chat-app
{{- end }}

{{/*
Selector-лейблы.
*/}}
{{- define "chat-app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "chat-app.fullname" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
