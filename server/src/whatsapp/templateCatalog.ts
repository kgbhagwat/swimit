/** Canonical WhatsApp template names used by SwimIT outbound messages. */
export const WA_TEMPLATES = {
  signupOtp: 'swimit_signup_otp',
  accountReady: 'swimit_welcome',
  accountLogin: 'swimit_login_info',
  accountLoginWithPassword: 'swimit_login_creds',
  registrationOk: 'swimit_registration_ok',
  passReady: 'swimit_pass_ready',
  passExpiring: 'swimit_pass_expiring',
  subExpiring: 'swimit_sub_expiring',
  openForm: 'swimit_open_form',
  renewPay: 'swimit_renew_pay',
  passPay: 'swimit_pass_pay',
  batchLimit: 'swimit_batch_limit',
  remoteLogin: 'swimit_remote_login',
  capacity: 'swimit_capacity',
  broadcast: 'swimit_broadcast',
} as const;
