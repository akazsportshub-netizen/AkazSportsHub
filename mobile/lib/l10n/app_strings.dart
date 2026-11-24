import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// All words the player sees, in English and Arabic. `{name}` marks a value filled in at run time.
/// A missing Arabic entry falls back to English, and a missing key shows the key itself.
class AppStrings {
  AppStrings(this.locale);

  final Locale locale;

  static const List<Locale> supportedLocales = [Locale('en'), Locale('ar')];
  static const LocalizationsDelegate<AppStrings> delegate = _AppStringsDelegate();

  static AppStrings of(BuildContext context) => Localizations.of<AppStrings>(context, AppStrings) ?? AppStrings(const Locale('en'));

  bool get isArabic => locale.languageCode == 'ar';

  String t(String key, [Map<String, Object> args = const {}]) {
    var text = (isArabic ? _ar[key] : null) ?? _en[key] ?? key;
    args.forEach((name, value) => text = text.replaceAll('{$name}', value.toString()));
    return text;
  }

  /// For tests: every key that exists in English.
  @visibleForTesting
  static Map<String, String> get english => _en;

  @visibleForTesting
  static Map<String, String> get arabic => _ar;
}

extension AppStringsContext on BuildContext {
  String t(String key, [Map<String, Object> args = const {}]) => AppStrings.of(this).t(key, args);

  /// "PADEL" → "Padel" / "البادل"; unknown sports show as typed.
  String sportName(String sport) {
    final key = 'sport_${sport.toLowerCase()}';
    final text = t(key);
    return text == key ? sport : text;
  }

  /// "CONFIRMED" → "Confirmed" / "مؤكد"; unknown statuses show title-cased.
  String statusLabel(String status) {
    final key = 'status_${status.toLowerCase()}';
    final text = t(key);
    if (text != key) return text;
    return status.isEmpty ? status : status[0] + status.substring(1).toLowerCase();
  }
}

class _AppStringsDelegate extends LocalizationsDelegate<AppStrings> {
  const _AppStringsDelegate();

  @override
  bool isSupported(Locale locale) => locale.languageCode == 'en' || locale.languageCode == 'ar';

  @override
  Future<AppStrings> load(Locale locale) => SynchronousFuture(AppStrings(locale));

  @override
  bool shouldReload(_AppStringsDelegate old) => false;
}

const Map<String, String> _en = {
  // common
  'try_again': 'Try again',
  'cancel': 'Cancel',
  'switch_language': 'العربية',

  // statuses
  'status_confirmed': 'Confirmed',
  'status_paid': 'Paid',
  'status_accepted': 'Accepted',
  'status_hold': 'On hold',
  'status_pending': 'Pending',
  'status_sent': 'Sent',
  'status_cancelled': 'Cancelled',
  'status_expired': 'Expired',
  'status_declined': 'Declined',
  'status_refunded': 'Refunded',
  'status_completed': 'Completed',

  // sports
  'sport_football': 'Football',
  'sport_padel': 'Padel',
  'sport_badminton': 'Badminton',
  'sport_basketball': 'Basketball',
  'sport_volleyball': 'Volleyball',
  'sport_tennis': 'Tennis',
  'sport_cricket': 'Cricket',

  // home
  'tab_discover': 'Discover',
  'tab_bookings': 'Bookings',
  'tab_invites': 'Invites',
  'tab_referee': 'Referee',
  'title_find_court': 'Find a court',
  'title_my_bookings': 'My bookings',
  'title_invites': 'Ringer invites',
  'title_referee': 'Referee console',
  'signout_title': 'Sign out?',
  'signout_body': 'You are signed in as {name}.',
  'stay': 'Stay',
  'sign_out': 'Sign out',
  'signed_in_as': 'Signed in as {name}',
  'demo_user': 'a demo user',

  // sign in
  'sign_in': 'Sign in',
  'sign_in_phone_button': 'Sign in with your phone',
  'dev_signin_hint': 'Development sign-in — choose who to play as.',
  'players': 'Players',
  'other_roles': 'Other roles',
  'psi_enter_phone': 'Enter your phone number and we will text you a code.',
  'psi_enter_code': 'Enter the code we sent to {phone}.',
  'phone_number': 'Phone number',
  'code_label': '6-digit code',
  'name_new_hint': 'New to AKAZ? Add your name to create your account.',
  'name_required_hint': 'This number is new to AKAZ. What should we call you?',
  'your_name': 'Your name (new numbers only)',
  'send_code': 'Send code',
  'use_other_number': 'Use a different number',
  'err_phone': 'Enter your number with the country code, e.g. +97455500010.',
  'err_code': 'Enter the 6 digits from the message.',

  // discover
  'all_sports': 'All sports',
  'no_venues': 'No venues within 30 km of {city} yet.',
  'no_venues_sport': 'No {sport} venues within 30 km of {city} yet.',
  'from_price': 'From {price} / hour',
  'city_doha': 'Doha',
  'city_lusail': 'Lusail',
  'city_riyadh': 'Riyadh',
  'city_dubai': 'Dubai',
  'city_manama': 'Manama',
  'city_muscat': 'Muscat',
  'near_me': 'Near me',
  'location_denied': 'Location permission was denied. Allow it in your device settings to find courts near you.',
  'location_off': 'Location is switched off on this device. Turn it on and try again.',
  'location_failed': "We couldn't find your location. Try again or pick a city.",
  'no_venues_here': 'No venues within 30 km of you yet.',
  'no_venues_here_sport': 'No {sport} venues within 30 km of you yet.',
  'home_title': 'Get invites for nearby games?',
  'home_body': 'We can save this area so games near you that are a player short can invite you. You will only be invited to games close to here.',
  'home_yes': 'Yes, invite me',
  'home_no': 'Not now',
  'home_saved': 'Saved. You will get invites for games near here.',

  // venue
  'turf_only': 'Turf shoes only',
  'turf_default': 'TF turf shoes required — no metal or FG studs.',
  'venue_rules': 'Venue rules',
  'courts': 'Courts',
  'no_courts': 'No courts are open for booking at this venue yet.',
  'up_to_players': 'up to {n} players',
  'per_hour': 'per hour',
  'rule_arrive': 'Arrive {n} minutes before your slot',

  // court slots
  'slot_taken': 'Someone has just taken that slot. Please pick another.',
  'today': 'Today',
  'no_slots': 'No more slots on this day. Try another date.',
  'booked': 'Booked',

  // hold dialog
  'hold_title': 'Hold this slot?',
  'split_with_friends': 'Split with friends',
  'friend_phone': "Friend's phone",
  'add_friend': 'Add friend',
  'hold_err_phone': 'Enter the number with the country code, e.g. +97455512345.',
  'court_holds': 'This court holds {n} players.',
  'own_number': 'That is your own number.',
  'already_added': '{name} is already added.',
  'no_player_number': 'No AKAZ player uses that number.',
  'add_one_friend': 'Add at least one friend to split.',
  'split_summary': '{people} players, about {share} each. Everyone pays their own share within 15 minutes.',
  'hold_alone': 'The slot is held for you for 15 minutes. Pay within that time to confirm it.',
  'hold_slot': 'Hold slot',

  // my bookings
  'no_bookings': 'No bookings yet.\nFind a court on the Discover tab.',
  'upcoming': 'Upcoming',
  'past_cancelled': 'Past and cancelled',
  'your_share': 'Your share {amount}',
  'paid_suffix': 'paid',

  // booking
  'booking': 'Booking',
  'payment_succeeded': 'Payment received.',
  'payment_failed': 'The payment failed. You can try again.',
  'open_payment_failed': 'Could not open the payment page.',
  'test_payment': 'Test payment',
  'mock_explain': 'The backend is using mock payments, so no real money moves. Choose what the payment provider should answer.',
  'pay_succeeds': 'Payment succeeds',
  'pay_fails': 'Payment fails',
  'cancel_title': 'Cancel this booking?',
  'cancel_confirmed_body': 'Everyone who paid gets their money back. Free cancellation ends {hours} hours before the start.',
  'cancel_hold_body': 'The slot is released and nobody is charged.',
  'keep_it': 'Keep it',
  'cancel_booking': 'Cancel booking',
  'booking_cancelled': 'Booking cancelled.',
  'short_title': 'Players short?',
  'short_body': 'We will invite nearby players with a good reliability score, closest first.',
  'player_needed': 'player needed',
  'players_needed': 'players needed',
  'find_players': 'Find players',
  'looking_one': 'Looking for 1 player. Invitations go out in waves.',
  'looking_many': 'Looking for {n} players. Invitations go out in waves.',
  'hold_ran_out': 'The hold has run out',
  'held_for': 'Held for {time}',
  'hold_released': 'The slot is being released. Pull down to refresh.',
  'pay_before': 'Pay before the timer ends or the slot is released.',
  'everyone_paid': 'Everyone has paid. See you on the pitch.',
  'payment': 'Payment',
  'extra_player': 'extra player',
  'pay_by': 'pay by {time}',
  'pay': 'Pay',
  'total': 'Total',
  'all_paid_confirming': 'All shares are paid. Confirming the booking…',
  'short_button': 'We are players short',

  // invites
  'invite_accepted_pay': 'You have a place! Pay your share of {amount} within 15 minutes to keep it.',
  'invite_in': 'You are in! See you there.',
  'invite_declined': 'Invitation declined.',
  'too_late': 'Too late — all places have been taken.',
  'no_invites': 'No invitations right now.\nWhen a nearby game is a player short, it shows up here.',
  'invite_title': '{sport} at {venue}',
  'away': '{distance} away',
  'places_left': '{left} of {total} places left',
  'all_taken': 'All places taken',
  'decline': 'Decline',
  'im_in': "I'm in",

  'tab_manage': 'Venue',
  'title_manage': 'Venue manager',
  'mgr_bookings': 'Bookings',
  'mgr_courts': 'Courts',
  'mgr_blocks': 'Closures',
  'mgr_earnings': 'Earnings',
  'mgr_no_venue': 'No venue is assigned to this account.',
  'mgr_no_bookings': 'No bookings in the next two weeks.',
  'mgr_paid_of': '{paid} of {total} paid',
  'mgr_booked_by': 'Booked by {name}',
  'mgr_cancel_booking': 'Cancel booking',
  'mgr_cancel_title': 'Cancel this booking?',
  'mgr_cancel_body': 'Everyone who has paid is refunded and the slot opens up again.',
  'mgr_keep': 'Keep booking',
  'mgr_cancelled': 'Booking cancelled.',
  'mgr_add_court': 'Add court',
  'mgr_edit_court': 'Edit court',
  'mgr_court_name': 'Court name',
  'mgr_sport': 'Sport',
  'mgr_price': 'Price per hour ({currency})',
  'mgr_price_note': 'A new price applies to new bookings only.',
  'mgr_capacity': 'Players',
  'mgr_slot': 'Slot length (minutes)',
  'mgr_opens': 'Opens (HH:MM)',
  'mgr_closes': 'Closes (HH:MM, 00:00 = midnight)',
  'mgr_active': 'Open for booking',
  'mgr_inactive': 'Switched off',
  'mgr_invalid': 'Check the fields marked in red.',
  'mgr_save': 'Save',
  'mgr_saved': 'Saved.',
  'mgr_court_line': '{sport} · {players} players · {price} per hour',
  'mgr_hours_line': '{opens}–{closes}, {minutes}-minute slots',
  'mgr_no_blocks': 'No closures. Close a court for maintenance or a private event.',
  'mgr_block_court': 'Close a court',
  'mgr_pick_court': 'Court',
  'mgr_block_date': 'Date',
  'mgr_block_from': 'From',
  'mgr_block_to': 'Until',
  'mgr_block_reason': 'Reason (optional)',
  'mgr_block_add': 'Close court',
  'mgr_block_added': 'Court closed for that time.',
  'mgr_block_removed': 'Closure removed.',
  'mgr_remove': 'Remove',
  'mgr_this_month': 'This month',
  'mgr_last_7': 'Last 7 days',
  'mgr_last_month': 'Last month',
  'mgr_gross': 'Bookings total',
  'mgr_commission': 'AKAZ commission',
  'mgr_net': 'Your earnings',
  'mgr_count': '{n} bookings',
  'mgr_no_earnings': 'No bookings in this period.',
  'mgr_earn_note': 'Counts confirmed and completed bookings by the day they are played. Cancelled bookings are refunded and not counted. Payouts to the venue are not tracked yet.',
  'mgr_close': 'Close',

  'sign_in_email_button': 'Sign in with your email',
  'esi_enter_email': 'Enter your email address and we will email you a code.',
  'esi_enter_code': 'Enter the code we sent to {email}.',
  'email_address': 'Email address',
  'err_email': 'Enter a valid email address, e.g. name@example.com.',
  'use_other_email': 'Use a different email',
  'your_country': 'Country',
  'details_new_hint': 'New to AKAZ? Add your name and country to create your account.',
  'details_required_hint': 'This email is new to AKAZ. What should we call you, and where do you play?',
  'country_qa': 'Qatar',
  'country_sa': 'Saudi Arabia',
  'country_ae': 'United Arab Emirates',
  'country_kw': 'Kuwait',
  'country_bh': 'Bahrain',
  'country_om': 'Oman',
};

const Map<String, String> _ar = {
  'try_again': 'حاول مرة أخرى',
  'cancel': 'إلغاء',
  'switch_language': 'English',

  'status_confirmed': 'مؤكد',
  'status_paid': 'مدفوع',
  'status_accepted': 'مقبول',
  'status_hold': 'محجوز مؤقتًا',
  'status_pending': 'قيد الانتظار',
  'status_sent': 'مُرسلة',
  'status_cancelled': 'ملغى',
  'status_expired': 'منتهٍ',
  'status_declined': 'مرفوض',
  'status_refunded': 'تم الاسترداد',
  'status_completed': 'مكتمل',

  'sport_football': 'كرة القدم',
  'sport_padel': 'البادل',
  'sport_badminton': 'الريشة الطائرة',
  'sport_basketball': 'كرة السلة',
  'sport_volleyball': 'الكرة الطائرة',
  'sport_tennis': 'التنس',
  'sport_cricket': 'الكريكت',

  'tab_discover': 'استكشاف',
  'tab_bookings': 'الحجوزات',
  'tab_invites': 'الدعوات',
  'tab_referee': 'الحكم',
  'title_find_court': 'ابحث عن ملعب',
  'title_my_bookings': 'حجوزاتي',
  'title_invites': 'دعوات اللاعبين',
  'title_referee': 'لوحة الحكم',
  'signout_title': 'تسجيل الخروج؟',
  'signout_body': 'أنت مسجّل الدخول باسم {name}.',
  'stay': 'البقاء',
  'sign_out': 'تسجيل الخروج',
  'signed_in_as': 'مسجّل الدخول باسم {name}',
  'demo_user': 'مستخدم تجريبي',

  'sign_in': 'تسجيل الدخول',
  'sign_in_phone_button': 'سجّل الدخول برقم هاتفك',
  'dev_signin_hint': 'دخول تجريبي — اختر اللاعب.',
  'players': 'اللاعبون',
  'other_roles': 'أدوار أخرى',
  'psi_enter_phone': 'أدخل رقم هاتفك وسنرسل لك رمزًا.',
  'psi_enter_code': 'أدخل الرمز الذي أرسلناه إلى {phone}.',
  'phone_number': 'رقم الهاتف',
  'code_label': 'الرمز المكوّن من 6 أرقام',
  'name_new_hint': 'جديد في AKAZ؟ أضف اسمك لإنشاء حسابك.',
  'name_required_hint': 'هذا الرقم جديد في AKAZ. بماذا نناديك؟',
  'your_name': 'اسمك (للأرقام الجديدة فقط)',
  'send_code': 'إرسال الرمز',
  'use_other_number': 'استخدم رقمًا آخر',
  'err_phone': 'أدخل رقمك مع رمز الدولة، مثل +97455500010.',
  'err_code': 'أدخل الأرقام الستة من الرسالة.',

  'all_sports': 'كل الرياضات',
  'no_venues': 'لا توجد ملاعب ضمن 30 كم من {city} بعد.',
  'no_venues_sport': 'لا توجد ملاعب {sport} ضمن 30 كم من {city} بعد.',
  'from_price': 'ابتداءً من {price} / ساعة',
  'city_doha': 'الدوحة',
  'city_lusail': 'لوسيل',
  'city_riyadh': 'الرياض',
  'city_dubai': 'دبي',
  'city_manama': 'المنامة',
  'city_muscat': 'مسقط',
  'near_me': 'بالقرب مني',
  'location_denied': 'تم رفض إذن الموقع. اسمح به من إعدادات جهازك للعثور على ملاعب بالقرب منك.',
  'location_off': 'خدمة الموقع متوقفة على هذا الجهاز. شغّلها وحاول مرة أخرى.',
  'location_failed': 'تعذّر تحديد موقعك. حاول مرة أخرى أو اختر مدينة.',
  'no_venues_here': 'لا توجد ملاعب ضمن 30 كم منك بعد.',
  'no_venues_here_sport': 'لا توجد ملاعب {sport} ضمن 30 كم منك بعد.',
  'home_title': 'تريد دعوات للمباريات القريبة؟',
  'home_body': 'يمكننا حفظ هذه المنطقة ليدعوك أصحاب المباريات القريبة التي تحتاج لاعبًا. ستصلك الدعوات للمباريات القريبة من هنا فقط.',
  'home_yes': 'نعم، ادعوني',
  'home_no': 'ليس الآن',
  'home_saved': 'تم الحفظ. ستصلك دعوات المباريات القريبة من هنا.',

  'turf_only': 'أحذية العشب الصناعي فقط',
  'turf_default': 'يجب ارتداء أحذية TF للعشب الصناعي — بدون مسامير معدنية أو FG.',
  'venue_rules': 'قواعد الملعب',
  'courts': 'الملاعب',
  'no_courts': 'لا توجد ملاعب متاحة للحجز في هذا المكان بعد.',
  'up_to_players': 'حتى {n} لاعبين',
  'per_hour': 'في الساعة',
  'rule_arrive': 'احضر قبل موعدك بـ {n} دقيقة',

  'slot_taken': 'حجز أحدهم هذا الموعد للتو. الرجاء اختيار موعد آخر.',
  'today': 'اليوم',
  'no_slots': 'لا توجد مواعيد أخرى في هذا اليوم. جرّب تاريخًا آخر.',
  'booked': 'محجوز',

  'hold_title': 'حجز هذا الموعد مؤقتًا؟',
  'split_with_friends': 'قسّم مع الأصدقاء',
  'friend_phone': 'هاتف الصديق',
  'add_friend': 'إضافة صديق',
  'hold_err_phone': 'أدخل الرقم مع رمز الدولة، مثل +97455512345.',
  'court_holds': 'يتسع هذا الملعب لـ {n} لاعبين.',
  'own_number': 'هذا رقمك أنت.',
  'already_added': 'تمت إضافة {name} بالفعل.',
  'no_player_number': 'لا يوجد لاعب في AKAZ بهذا الرقم.',
  'add_one_friend': 'أضف صديقًا واحدًا على الأقل للتقسيم.',
  'split_summary': '{people} لاعبين، حوالي {share} لكل واحد. يدفع كل لاعب حصته خلال 15 دقيقة.',
  'hold_alone': 'الموعد محجوز لك لمدة 15 دقيقة. ادفع خلال هذه المدة لتأكيده.',
  'hold_slot': 'احجز الموعد',

  'no_bookings': 'لا توجد حجوزات بعد.\nابحث عن ملعب من تبويب استكشاف.',
  'upcoming': 'القادمة',
  'past_cancelled': 'السابقة والملغاة',
  'your_share': 'حصتك {amount}',
  'paid_suffix': 'مدفوعة',

  'booking': 'الحجز',
  'payment_succeeded': 'تم استلام الدفعة.',
  'payment_failed': 'فشلت الدفعة. يمكنك المحاولة مرة أخرى.',
  'open_payment_failed': 'تعذّر فتح صفحة الدفع.',
  'test_payment': 'دفعة تجريبية',
  'mock_explain': 'الخادم يستخدم مدفوعات تجريبية، لذا لا تتحرك أي أموال حقيقية. اختر ما سيردّ به مزوّد الدفع.',
  'pay_succeeds': 'نجاح الدفع',
  'pay_fails': 'فشل الدفع',
  'cancel_title': 'إلغاء هذا الحجز؟',
  'cancel_confirmed_body': 'يسترد كل من دفع أمواله. ينتهي الإلغاء المجاني قبل {hours} ساعة من البداية.',
  'cancel_hold_body': 'يتم تحرير الموعد ولا يُحاسَب أحد.',
  'keep_it': 'إبقاء الحجز',
  'cancel_booking': 'إلغاء الحجز',
  'booking_cancelled': 'تم إلغاء الحجز.',
  'short_title': 'تحتاج لاعبين؟',
  'short_body': 'سندعو لاعبين قريبين ذوي موثوقية جيدة، الأقرب أولًا.',
  'player_needed': 'لاعب مطلوب',
  'players_needed': 'لاعبون مطلوبون',
  'find_players': 'ابحث عن لاعبين',
  'looking_one': 'نبحث عن لاعب واحد. تُرسل الدعوات على دفعات.',
  'looking_many': 'نبحث عن {n} لاعبين. تُرسل الدعوات على دفعات.',
  'hold_ran_out': 'انتهت مدة الحجز المؤقت',
  'held_for': 'محجوز لمدة {time}',
  'hold_released': 'يتم تحرير الموعد. اسحب للأسفل للتحديث.',
  'pay_before': 'ادفع قبل انتهاء المؤقت وإلا سيتم تحرير الموعد.',
  'everyone_paid': 'دفع الجميع. نراكم في الملعب.',
  'payment': 'الدفع',
  'extra_player': 'لاعب إضافي',
  'pay_by': 'ادفع قبل {time}',
  'pay': 'ادفع',
  'total': 'الإجمالي',
  'all_paid_confirming': 'تم دفع جميع الحصص. جارٍ تأكيد الحجز…',
  'short_button': 'ينقصنا لاعبون',

  'invite_accepted_pay': 'لديك مكان! ادفع حصتك البالغة {amount} خلال 15 دقيقة للاحتفاظ به.',
  'invite_in': 'أنت معنا! نراك هناك.',
  'invite_declined': 'تم رفض الدعوة.',
  'too_late': 'فات الأوان — اكتملت جميع الأماكن.',
  'no_invites': 'لا توجد دعوات حاليًا.\nعندما تحتاج مباراة قريبة إلى لاعب، ستظهر هنا.',
  'invite_title': '{sport} في {venue}',
  'away': 'على بعد {distance}',
  'places_left': 'متبقي {left} من {total} أماكن',
  'all_taken': 'اكتملت الأماكن',
  'decline': 'رفض',
  'im_in': 'سأنضم',

  'tab_manage': 'المنشأة',
  'title_manage': 'مدير المنشأة',
  'mgr_bookings': 'الحجوزات',
  'mgr_courts': 'الملاعب',
  'mgr_blocks': 'الإغلاقات',
  'mgr_earnings': 'الأرباح',
  'mgr_no_venue': 'لا توجد منشأة مرتبطة بهذا الحساب.',
  'mgr_no_bookings': 'لا توجد حجوزات خلال الأسبوعين القادمين.',
  'mgr_paid_of': 'دفع {paid} من {total}',
  'mgr_booked_by': 'حجز بواسطة {name}',
  'mgr_cancel_booking': 'إلغاء الحجز',
  'mgr_cancel_title': 'إلغاء هذا الحجز؟',
  'mgr_cancel_body': 'سيتم رد المبالغ لجميع من دفعوا وسيصبح الموعد متاحًا من جديد.',
  'mgr_keep': 'إبقاء الحجز',
  'mgr_cancelled': 'تم إلغاء الحجز.',
  'mgr_add_court': 'إضافة ملعب',
  'mgr_edit_court': 'تعديل الملعب',
  'mgr_court_name': 'اسم الملعب',
  'mgr_sport': 'الرياضة',
  'mgr_price': 'السعر للساعة ({currency})',
  'mgr_price_note': 'السعر الجديد يسري على الحجوزات الجديدة فقط.',
  'mgr_capacity': 'عدد اللاعبين',
  'mgr_slot': 'مدة الموعد (بالدقائق)',
  'mgr_opens': 'وقت الفتح (HH:MM)',
  'mgr_closes': 'وقت الإغلاق (HH:MM، و00:00 يعني منتصف الليل)',
  'mgr_active': 'متاح للحجز',
  'mgr_inactive': 'متوقف',
  'mgr_invalid': 'تحقق من الحقول المعلّمة بالأحمر.',
  'mgr_save': 'حفظ',
  'mgr_saved': 'تم الحفظ.',
  'mgr_court_line': '{sport} · {players} لاعبين · {price} للساعة',
  'mgr_hours_line': '{opens}–{closes}، مواعيد من {minutes} دقيقة',
  'mgr_no_blocks': 'لا توجد إغلاقات. أغلق ملعبًا للصيانة أو لمناسبة خاصة.',
  'mgr_block_court': 'إغلاق ملعب',
  'mgr_pick_court': 'الملعب',
  'mgr_block_date': 'التاريخ',
  'mgr_block_from': 'من',
  'mgr_block_to': 'إلى',
  'mgr_block_reason': 'السبب (اختياري)',
  'mgr_block_add': 'إغلاق الملعب',
  'mgr_block_added': 'تم إغلاق الملعب في ذلك الوقت.',
  'mgr_block_removed': 'تمت إزالة الإغلاق.',
  'mgr_remove': 'إزالة',
  'mgr_this_month': 'هذا الشهر',
  'mgr_last_7': 'آخر 7 أيام',
  'mgr_last_month': 'الشهر الماضي',
  'mgr_gross': 'إجمالي الحجوزات',
  'mgr_commission': 'عمولة أكاز',
  'mgr_net': 'أرباحك',
  'mgr_count': '{n} حجوزات',
  'mgr_no_earnings': 'لا توجد حجوزات في هذه الفترة.',
  'mgr_earn_note': 'تشمل الحجوزات المؤكدة والمكتملة حسب يوم اللعب. الحجوزات الملغاة يُرد مبلغها ولا تُحتسب. لا يتم تتبع التحويلات للمنشأة بعد.',
  'mgr_close': 'إغلاق النافذة',

  'sign_in_email_button': 'سجّل الدخول ببريدك الإلكتروني',
  'esi_enter_email': 'أدخل بريدك الإلكتروني وسنرسل لك رمزًا.',
  'esi_enter_code': 'أدخل الرمز الذي أرسلناه إلى {email}.',
  'email_address': 'البريد الإلكتروني',
  'err_email': 'أدخل بريدًا إلكترونيًا صحيحًا، مثل name@example.com.',
  'use_other_email': 'استخدم بريدًا آخر',
  'your_country': 'الدولة',
  'details_new_hint': 'جديد في AKAZ؟ أضف اسمك ودولتك لإنشاء حسابك.',
  'details_required_hint': 'هذا البريد جديد في AKAZ. بماذا نناديك، وأين تلعب؟',
  'country_qa': 'قطر',
  'country_sa': 'السعودية',
  'country_ae': 'الإمارات العربية المتحدة',
  'country_kw': 'الكويت',
  'country_bh': 'البحرين',
  'country_om': 'عُمان',
};
